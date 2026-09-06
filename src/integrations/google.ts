// ============================================================================
// SERVIÇO DE AUTENTICAÇÃO GOOGLE (Google Identity Services + Supabase Auth)
// ============================================================================
// FLUXO (popup oficial do Google, sem redirect de página):
//   1. O botão oficial do Google (GIS) abre o popup de autorização.
//   2. O Google devolve um ID token (JWT) assinado, com nonce anti-replay.
//   3. signInWithGoogleIdToken() troca o token por uma sessão Supabase
//      (supabase.auth.signInWithIdToken) — os erros já chegam traduzidos à UI.
//   4. O listener onAuthStateChange (src/hooks/useAuth.tsx) detecta a sessão,
//      carrega/cria o profile e libera o dashboard (amigos, canais, DMs).
//
// ------------------------ DOMÍNIOS A AUTORIZAR ------------------------------
// SEM ISSO O POPUP NÃO ABRE (erro "origin not allowed" / botão não renderiza):
//
// 1) Google Cloud Console → APIs e Serviços → Credenciais → ID do cliente
//    OAuth 2.0 (tipo "Aplicativo da Web") → "Origens JavaScript autorizadas":
//      • http://localhost:8080            (desenvolvimento — Vite)
//      • http://localhost:5173            (dev alternativo, se usado)
//      • https://SEU-DOMINIO.com.br       (produção)
//      • https://SEU-DEPLOY.vercel.app    (preview/produção, se usado)
//    "URIs de redirecionamento autorizados": NÃO é necessário neste fluxo
//    (o GIS usa popup/iframe, sem redirect de página).
//
// 2) Lovable Cloud → Users & auth → Google:
//      • Cadastre o MESMO Client ID em "Authorized Client IDs".
//      • O VITE_GOOGLE_CLIENT_ID (no .env) deve ser IDÊNTICO a esse valor.
//        (Divergência entre os dois = erro de "audience"/"invalid credentials".)
//
// 3) Não há nada para configurar no Firebase: este fluxo é Google + Supabase.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export const GOOGLE_CLIENT_ID: string =
  (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';

export type GoogleCredentialResponse = {
  credential?: string;
};

export type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    // FedCM (Chrome 108+): popup gerenciado pelo próprio navegador, o que
    // reduz drasticamente bloqueios de popup e falhas por cookies de 3ª parte.
    use_fedcm_for_popup?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: string;
      theme?: string;
      size?: string;
      text?: string;
      shape?: string;
      logo_alignment?: string;
      width?: number;
      locale?: string;
    },
  ): void;
  prompt(): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<GoogleIdApi> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
      const script = existing ?? document.createElement('script');
      const onLoad = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id);
        } else {
          scriptPromise = null;
          reject(new Error('Google Identity Services indisponível.'));
        }
      };
      const onError = () => {
        scriptPromise = null;
        reject(new Error('Não foi possível carregar o login do Google (script bloqueado?). Verifique extensões bloqueadoras e tente de novo.'));
      };
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
      if (!existing) {
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }
  return scriptPromise;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

// Nonce anti-replay: o valor bruto vai para signInWithIdToken e o hash SHA-256
// vai para o Google embutir no ID token (padrão recomendado pelo Supabase).
export async function createGoogleNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = toBase64(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: toBase64(new Uint8Array(digest)) };
}

// ---------------------------------------------------------------------------
// Serviço: troca o ID token do popup por uma sessão Supabase.
// A UI nunca chama o Supabase diretamente — recebe { ok, error? } traduzido.
// ---------------------------------------------------------------------------
export type GoogleSignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithGoogleIdToken(
  credential: string,
  nonce?: string | null,
): Promise<GoogleSignInResult> {
  try {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: credential,
      ...(nonce ? { nonce } : {}),
    });
    if (error) return { ok: false, error: describeGoogleAuthError(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeGoogleAuthError(err) };
  }
}

// Traduz para PT-BR os erros comuns de pop-up, cookies, domínio e provedor,
// sem quebrar a aplicação (a UI só exibe a mensagem retornada).
export function describeGoogleAuthError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err ?? '');
            } catch {
              return '';
            }
          })();
  const msg = raw.toLowerCase();

  // Causa nº 1: discrepância de domínios / Client ID (origem não autorizada).
  if (
    msg.includes('audience') ||
    msg.includes('unauthorized_client') ||
    msg.includes('invalid client') ||
    msg.includes('client_id') ||
    msg.includes('origin')
  ) {
    return 'Origem não autorizada: o Client ID do Google usado pelo site precisa estar nas "Origens JavaScript autorizadas" do Google Cloud Console (inclua http://localhost:8080 e o domínio de produção) e cadastrado no provedor Google do Lovable Cloud (Users & auth → Google).';
  }
  if (msg.includes('provider') && (msg.includes('not enabled') || msg.includes('unsupported') || msg.includes('disabled')))
    return 'O provedor Google ainda não está habilitado no backend (Lovable Cloud → Users & auth → Google → cadastre o Client ID).';
  if (msg.includes('nonce'))
    return 'Falha de validação de segurança (nonce). Recarregue a página e tente entrar novamente.';
  if (
    msg.includes('invalid credentials') ||
    msg.includes('invalid idp') ||
    msg.includes('invalid id token') ||
    msg.includes('invalid_grant') ||
    msg.includes('malformed')
  )
    return 'O Google rejeitou o token deste login. Confira se o provedor Google está habilitado no Lovable Cloud (Users & auth → Google) e tente novamente.';
  if (msg.includes('signup') && msg.includes('disabled'))
    return 'Novos cadastros estão desativados no momento. Entre com uma conta existente.';
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed'))
    return 'Falha de rede ao validar o login. Verifique sua conexão e tente de novo.';
  if (msg.includes('popup') || msg.includes('janela'))
    return 'A janela do Google foi fechada ou bloqueada. Permita pop-ups para este site e tente de novo.';
  if (msg.includes('cookie') || msg.includes('third-party'))
    return 'Seu navegador bloqueou os cookies necessários para o login do Google. Habilite cookies de terceiros ou atualize o Chrome (modo FedCM).';

  return 'Não foi possível concluir o login com o Google. Tente novamente em instantes.';
}
