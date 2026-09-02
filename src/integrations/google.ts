// Login com Google via Google Identity Services (popup do Google, sem redirect).
// O ID token retornado pelo popup é trocado por uma sessão no backend com
// supabase.auth.signInWithIdToken — o backend valida o token contra o Client ID
// cadastrado no provedor Google (Lovable Cloud → Users & auth → Google).
// IMPORTANTE: VITE_GOOGLE_CLIENT_ID precisa ser o MESMO Client ID cadastrado lá.
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';

export type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
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
        reject(new Error('Não foi possível carregar o login do Google (script bloqueado?).'));
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
