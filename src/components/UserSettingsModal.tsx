import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, LogOut, UserRound, Loader2, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";

export function UserSettingsModal({ onClose }: { onClose: () => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("online");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.display_name ?? "");
    setStatus(profile?.status ?? "online");
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: username.trim(),
        display_name: displayName.trim() || null,
        status,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      await refreshProfile();
      setTimeout(() => setSaved(false), 2500);
    }
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: signed?.signedUrl ?? null })
      .eq("id", user.id);
    if (updErr) setError(updErr.message);
    else await refreshProfile();
    setUploading(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      <nav className="hidden w-full max-w-[240px] shrink-0 flex-col gap-1 bg-channels px-3 py-14 sm:pl-8 md:flex">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Configurações do usuário
        </p>
        <span className="flex items-center gap-2 rounded-lg bg-accent px-2 py-2 text-sm">
          <UserRound className="size-4" />
          Minha Conta
        </span>
        <div className="my-2 h-px bg-border" />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-destructive transition-colors duration-200 hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </nav>

      <section className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(3rem_+_env(safe-area-inset-bottom))] pt-4 sm:px-16 sm:py-14">
        <button
          onClick={onClose}
          aria-label="Fechar configurações"
          className="fixed right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full border border-muted-foreground/40 bg-background/80 text-muted-foreground backdrop-blur transition-all duration-200 hover:bg-accent hover:text-foreground md:absolute md:right-6 md:top-14 md:bg-transparent md:backdrop-blur-none"
        >
          <X className="size-5" />
        </button>

        <div className="animate-fade-up max-w-2xl">
          <h2 className="text-balance-tight text-xl font-bold">Minha Conta</h2>

          <div className="mt-6 overflow-hidden rounded-2xl bg-channels shadow-[0_16px_48px_-24px_rgba(0,0,0,0.9)]">
            <div className="h-24 bg-gradient-to-r from-primary to-[#7d87ff]" />
            <div className="-mt-10 px-6 pb-6">
              <div className="relative w-fit">
                <UserAvatar
                  username={profile?.username ?? "?"}
                  avatarUrl={profile?.avatar_url ?? null}
                  className="size-20 border-[6px] border-channels text-lg"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Alterar foto de perfil"
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-100 transition-opacity duration-200 hover:opacity-100 md:opacity-0"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Camera className="size-5" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatar}
                  className="hidden"
                />
              </div>

              <form onSubmit={handleSave} className="mt-6 space-y-4 rounded-xl bg-servers p-4">
                <Field label="Nome de usuário">
                  <input
                    required
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg bg-message-input px-3 py-2.5 text-base outline-none ring-1 ring-transparent transition-all focus:ring-primary/60 md:text-sm"
                  />
                </Field>
                <Field label="Nome de exibição">
                  <input
                    maxLength={64}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg bg-message-input px-3 py-2.5 text-base outline-none ring-1 ring-transparent transition-all focus:ring-primary/60 md:text-sm"
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg bg-message-input px-3 py-2.5 text-base outline-none ring-1 ring-transparent transition-all focus:ring-primary/60 md:text-sm"
                  >
                    <option value="online">Online</option>
                    <option value="ausente">Ausente</option>
                    <option value="ocupado">Não perturbe</option>
                    <option value="invisível">Invisível</option>
                  </select>
                </Field>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    E-mail
                  </p>
                  <p className="mt-1 text-sm">{user?.email ?? "—"}</p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {saved && <p className="text-sm text-[#3ba55d]">Alterações salvas!</p>}

                <button
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60 md:w-fit"
                >
                  {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
                </button>
              </form>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10 md:hidden"
          >
            <LogOut className="size-4" />
            Sair da conta
          </button>
        </div>
      </section>
    </div>
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
