import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  createGoogleNonce,
  GOOGLE_CLIENT_ID,
  loadGoogleIdentity,
  type GoogleCredentialResponse,
} from "@/integrations/google";
import { useServerFn } from "@tanstack/react-start";
import { loginByUsername } from "@/lib/auth-functions";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar no Concord — Chat em canais" },
      {
        name: "description",
        content:
          "Acesse sua conta Concord para conversar em canais de texto em tempo real com sua comunidade.",
      },
      { property: "og:title", content: "Entrar no Concord — Chat em canais" },
      {
        property: "og:description",
        content: "Entre ou crie sua conta Concord e converse em canais de texto em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

type UsernameState = "idle" | "checking" | "available" | "taken" | "invalid";

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const gisRef = useRef<HTMLDivElement | null>(null);
      const googleNonceRef = useRef<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // No login, permite escolher entre identificar por e-mail ou por @username.
  const [useUsername, setUseUsername] = useState(false);
  const loginUser = useServerFn(loginByUsername);

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/canais", replace: true });
  }, [authLoading, session, navigate]);

  // Validação assíncrona (com debounce) do @username no cadastro
  useEffect(() => {
    if (mode !== "signup") return;
    const value = username.trim().replace(/^@/, "");
    if (!value) {
      setUsernameState("idle");
      return;
    }
    if (!/^[a-z0-9._-]{3,32}$/i.test(value)) {
      setUsernameState("invalid");
      return;
    }
    setUsernameState("checking");
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("username_available", { _username: value });
      if (error) {
        setUsernameState("idle");
        return;
      }
      setUsernameState(data ? "available" : "taken");
    }, 400);
    return () => clearTimeout(timer);
  }, [username, mode]);

  // Google Identity Services: botão oficial do Google em popup, sem redirect.
  // O ID token do popup é trocado por uma sessão via supabase.auth.signInWithIdToken.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      try {
        const google = await loadGoogleIdentity();
        const { raw, hashed } = await createGoogleNonce();
        if (cancelled) return;
        googleNonceRef.current = raw;
        google.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          callback: (response) => {
            void handleGoogleCredential(response);
          },
        });
        if (gisRef.current) {
          google.renderButton(gisRef.current, {
            theme: "filled_blue",
            size: "large",
            text: "continue_with",
            shape: "pill",
            locale: "pt-BR",
          });
        }
        if (!cancelled) setGoogleReady(true);
      } catch {
        if (!cancelled) setGoogleReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        if (useUsername) {
          const result = await loginUser({ data: { username: loginIdentifier, password } });
          if (!result.ok) {
            throw new Error(result.error);
          }
          await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          });
          navigate({ to: "/canais", replace: true });
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          navigate({ to: "/canais", replace: true });
        }
      } else {
        const clean = username.trim().replace(/^@/, "");
        if (usernameState !== "available") {
          throw new Error("Escolha um @username válido e disponível para continuar.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: clean },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/canais", replace: true });
        } else {
          setNotice("Conta criada! Confirme seu e-mail para entrar.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) {
      setError("Não foi possível confirmar sua conta Google. Tente novamente.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        ...(googleNonceRef.current ? { nonce: googleNonceRef.current } : {}),
      });
      if (error) throw error;
      navigate({ to: "/canais", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login com Google.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-servers px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.18]"
      />
      <div className="animate-fade-up relative w-full max-w-md rounded-2xl bg-channels p-8 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.05]">
        <div className="text-center">
          <h1 className="text-balance-tight text-2xl font-bold">
            {mode === "signin" ? "Que bom te ver de novo!" : "Criar uma conta"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {mode === "signin"
              ? "Entre para continuar suas conversas no Concord."
              : "Junte-se ao Concord e comece a conversar."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <Field label="Nome de usuário (@)">
              <div
                className={`flex items-center gap-1 rounded-lg bg-message-input px-3 py-2.5 ring-1 transition-all focus-within:ring-primary/60 ${
                  usernameState === "taken" || usernameState === "invalid"
                    ? "ring-destructive/70"
                    : usernameState === "available"
                      ? "ring-[#3ba55d]/70"
                      : "ring-transparent"
                }`}
              >
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                  maxLength={32}
                  required
                  placeholder="zynox"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {usernameState === "checking" && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {usernameState === "taken" && (
                <p className="mt-1 text-xs font-medium text-destructive">Não disponível</p>
              )}
              {usernameState === "invalid" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Use 3 a 32 caracteres: letras, números, ponto, hífen ou underline.
                </p>
              )}
              {usernameState === "available" && (
                <p className="mt-1 text-xs font-medium text-[#3ba55d]">Disponível</p>
              )}
            </Field>
          )}

          {mode === "signin" && (
            <div className="flex items-center gap-2 rounded-lg bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => setUseUsername(false)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  !useUsername ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setUseUsername(true)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  useUsername ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Usuário
              </button>
            </div>
          )}

          <Field label={useUsername ? "Nome de usuário" : "E-mail"}>
            <input
              type={useUsername ? "text" : "email"}
              required
              value={useUsername ? loginIdentifier : email}
              onChange={(e) => {
                if (useUsername) {
                  setLoginIdentifier(e.target.value);
                } else {
                  setEmail(e.target.value);
                }
              }}
              placeholder={useUsername ? "seu_username" : "seu@email.com"}
              autoComplete={useUsername ? "username" : "email"}
              className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60"
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-[#3ba55d]">{notice}</p>}

          <button
            type="submit"
            disabled={busy || (mode === "signup" && usernameState !== "available")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Entrar" : "Registrar"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className={googleReady ? "flex justify-center" : "hidden"}>
          <div ref={gisRef} />
        </div>
        {!googleReady && (
          <button
            type="button"
            onClick={() =>
              setError(
                GOOGLE_CLIENT_ID
                  ? "Não foi possível carregar o login do Google. Atualize a página e tente de novo."
                  : "O login com Google ainda não está configurado neste deploy. Use e-mail e senha por enquanto.",
              )
            }
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-accent"
          >
            <GoogleIcon />
            Continuar com Google
          </button>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Precisando de uma conta?" : "Já tem uma conta?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signin" ? "Registre-se" : "Entrar"}
          </button>
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.67 2.84C6.71 7.29 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
