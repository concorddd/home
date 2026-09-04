import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { X, LogOut, UserRound, Loader2, Camera, Mic, Volume2, Video, Monitor, Bell, BellRing, Volume1, MessageSquare, Phone, UserPlus, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useNotifications";
import { ensureStorageBuckets } from "@/lib/storage.functions";

type SettingsTab = "account" | "voice" | "notifications";

export function UserSettingsModal({ onClose }: { onClose: () => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Notifications hook
  const notifications = useNotifications(user?.id);

  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("online");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Audio settings
  const [inputVolume, setInputVolume] = useState(80);
  const [outputVolume, setOutputVolume] = useState(80);
  const [inputDevice, setInputDevice] = useState("default");
  const [outputDevice, setOutputDevice] = useState("default");
  const [transmissionMode, setTransmissionMode] = useState<"voice" | "video">("voice");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [audioSaving, setAudioSaving] = useState(false);
  const [audioSaved, setAudioSaved] = useState(false);

  // Banner upload
  const bannerRef = useRef<HTMLInputElement>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const ensureBuckets = useServerFn(ensureStorageBuckets);

  useEffect(() => {
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.display_name ?? "");
    setStatus(profile?.status ?? "online");
  }, [profile]);

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingBanner(true);
    setError(null);

    // Garante que o bucket "banners" exista (cria com service role se disponível;
    // no localhost sem service role a chamada falha e seguimos com fallback).
    try {
      await ensureBuckets({ data: { buckets: ["banners"] } });
    } catch {
      // ignorado — usamos o bucket "avatars" como fallback abaixo se precisar.
    }

    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/banner-${Date.now()}.${ext}`;

    // 1) Tenta enviar para o bucket "banners".
    let bucket = "banners";
    let upErr: { message: string } | null = null;
    const first = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    upErr = first.error;

    // 2) Se o bucket "banners" não existir/estiver inacessível, cai para o
    //    bucket "avatars" (que já existe e o usuário já usa para o avatar).
    if (upErr) {
      bucket = "avatars";
      const retry = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      upErr = retry.error;
    }

    if (upErr) {
      setError(upErr.message);
      setUploadingBanner(false);
      return;
    }

    // "banners" é público -> URL pública. "avatars" é privado -> URL assinada (1 ano).
    let publicUrl: string;
    if (bucket === "banners") {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      publicUrl = data.publicUrl;
    } else {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!data?.signedUrl) {
        setError("Não foi possível gerar a URL do banner.");
        setUploadingBanner(false);
        return;
      }
      publicUrl = data.signedUrl;
    }

    const { error: updErr } = await supabase
      .from("profiles")
      .update({ banner_url: publicUrl })
      .eq("id", user.id);
    if (updErr) {
      setError(
        updErr.message.includes("banner_url")
          ? "A coluna banner_url ainda não existe no banco. Aplique a migration 20260901235000_add_banner_url.sql."
          : updErr.message,
      );
    } else {
      await refreshProfile();
    }
    setUploadingBanner(false);
  }

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

  async function handleSaveAudio(e: React.FormEvent) {
    e.preventDefault();
    setAudioSaving(true);
    setError(null);
    setAudioSaved(false);
    
    // Save audio settings to localStorage (or could be saved to database)
    const audioSettings = {
      inputVolume,
      outputVolume,
      inputDevice,
      outputDevice,
      transmissionMode,
      noiseSuppression,
      echoCancellation,
    };
    localStorage.setItem("audioSettings", JSON.stringify(audioSettings));
    
    setAudioSaving(false);
    setAudioSaved(true);
    setTimeout(() => setAudioSaved(false), 2500);
  }

  // Load audio settings on mount
  useEffect(() => {
    const saved = localStorage.getItem("audioSettings");
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setInputVolume(settings.inputVolume ?? 80);
        setOutputVolume(settings.outputVolume ?? 80);
        setInputDevice(settings.inputDevice ?? "default");
        setOutputDevice(settings.outputDevice ?? "default");
        setTransmissionMode(settings.transmissionMode ?? "voice");
        setNoiseSuppression(settings.noiseSuppression ?? true);
        setEchoCancellation(settings.echoCancellation ?? true);
      } catch {}
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      <nav className="hidden w-full max-w-[240px] shrink-0 flex-col gap-1 bg-channels px-3 py-14 sm:pl-8 md:flex">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Configurações do usuário
        </p>
        <button
          onClick={() => setActiveTab("account")}
          className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
            activeTab === "account" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          <UserRound className="size-4" />
          Minha Conta
        </button>
        <button
          onClick={() => setActiveTab("voice")}
          className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
            activeTab === "voice" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          <Mic className="size-4" />
          Voz e Vídeo
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
            activeTab === "notifications" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          <Bell className="size-4" />
          Notificações
        </button>
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

        {activeTab === "account" && (
          <div className="animate-fade-up max-w-2xl">
            <h2 className="text-balance-tight text-xl font-bold">Minha Conta</h2>

            <div className="mt-6 overflow-hidden rounded-2xl bg-channels shadow-[0_16px_48px_-24px_rgba(0,0,0,0.9)]">
              <div
                className="relative h-28 bg-gradient-to-r from-primary to-[#7d87ff] cursor-pointer group"
                style={profile?.banner_url ? { backgroundImage: `url(${profile.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                onClick={() => bannerRef.current?.click()}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingBanner ? (
                    <Loader2 className="size-6 animate-spin text-white" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-white">
                      <Camera className="size-6" />
                      <span className="text-xs font-medium">Alterar banner</span>
                    </div>
                  )}
                </div>
                <input
                  ref={bannerRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  className="hidden"
                />
              </div>
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
        )}

        {activeTab === "voice" && (
          <div className="animate-fade-up max-w-2xl">
            <h2 className="text-balance-tight text-xl font-bold">Voz e Vídeo</h2>
            <form onSubmit={handleSaveAudio} className="mt-6 space-y-6">
              <div className="rounded-xl bg-channels p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Mic className="size-5 text-primary" />
                  <h3 className="font-semibold">Entrada de Áudio</h3>
                </div>
                <Field label="Dispositivo de entrada">
                  <select value={inputDevice} onChange={(e) => setInputDevice(e.target.value)} className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60">
                    <option value="default">Padrão do sistema</option>
                    <option value="headset">Headset</option>
                  </select>
                </Field>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Volume de entrada</span>
                    <span className="text-sm text-muted-foreground">{inputVolume}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={inputVolume} onChange={(e) => setInputVolume(Number(e.target.value))} className="w-full accent-primary" />
                </div>
              </div>
              <div className="rounded-xl bg-channels p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Volume2 className="size-5 text-primary" />
                  <h3 className="font-semibold">Saída de Áudio</h3>
                </div>
                <Field label="Dispositivo de saída">
                  <select value={outputDevice} onChange={(e) => setOutputDevice(e.target.value)} className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60">
                    <option value="default">Padrão do sistema</option>
                    <option value="headset">Headset</option>
                  </select>
                </Field>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Volume de saída</span>
                    <span className="text-sm text-muted-foreground">{outputVolume}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={outputVolume} onChange={(e) => setOutputVolume(Number(e.target.value))} className="w-full accent-primary" />
                </div>
              </div>
              <div className="rounded-xl bg-channels p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Video className="size-5 text-primary" />
                  <h3 className="font-semibold">Tipo de Transmissão Padrão</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Escolha o modo padrão ao entrar em uma chamada</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setTransmissionMode("voice")} className={`flex flex-col items-center gap-2 rounded-lg p-4 transition-all ${transmissionMode === "voice" ? "bg-primary text-primary-foreground ring-2 ring-primary" : "bg-message-input hover:bg-accent"}`}>
                    <Mic className="size-6" />
                    <span className="text-sm font-medium">Apenas Voz</span>
                  </button>
                  <button type="button" onClick={() => setTransmissionMode("video")} className={`flex flex-col items-center gap-2 rounded-lg p-4 transition-all ${transmissionMode === "video" ? "bg-primary text-primary-foreground ring-2 ring-primary" : "bg-message-input hover:bg-accent"}`}>
                    <Video className="size-6" />
                    <span className="text-sm font-medium">Voz e Vídeo</span>
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-channels p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Monitor className="size-5 text-primary" />
                  <h3 className="font-semibold">Processamento de Áudio</h3>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Supressão de ruído</p>
                      <p className="text-xs text-muted-foreground">Remove ruídos de fundo</p>
                    </div>
                    <button type="button" onClick={() => setNoiseSuppression(!noiseSuppression)} className={`relative h-6 w-11 rounded-full transition-colors ${noiseSuppression ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${noiseSuppression ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Cancelamento de eco</p>
                      <p className="text-xs text-muted-foreground">Elimina o eco do áudio</p>
                    </div>
                    <button type="button" onClick={() => setEchoCancellation(!echoCancellation)} className={`relative h-6 w-11 rounded-full transition-colors ${echoCancellation ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${echoCancellation ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                </div>
              </div>
              {audioSaved && <p className="text-sm text-[#3ba55d]">Configurações de áudio salvas!</p>}
              <button disabled={audioSaving} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60">
                {audioSaving && <Loader2 className="size-4 animate-spin" />} Salvar configurações de áudio
              </button>
            </form>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="animate-fade-up max-w-2xl">
            <h2 className="text-balance-tight text-xl font-bold">Notificações</h2>

            <div className="mt-6 space-y-6">
              {notifications.permission !== "granted" && (
                <div className="rounded-2xl bg-primary/10 border border-primary/20 p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20">
                      <BellRing className="size-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Ative as notificações</h3>
                      <p className="text-sm text-muted-foreground">Permita notificações para receber alertas mesmo com o site fechado.</p>
                    </div>
                    <button onClick={() => notifications.requestPermission()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90">
                      Ativar
                    </button>
                  </div>
                </div>
              )}

              {notifications.permission === "granted" && (
                <div className="flex items-center gap-2 rounded-lg bg-[#3ba55d]/10 px-4 py-3 text-sm text-[#3ba55d]">
                  <Check className="size-4" />
                  Notificações ativadas - você receberá alertas mesmo com o site fechado
                </div>
              )}

              <div className="rounded-2xl bg-channels p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3 mb-6">
                  <Bell className="size-5 text-primary" />
                  <h3 className="font-semibold">Configurações gerais</h3>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Ativar notificações</p>
                      <p className="text-xs text-muted-foreground">Receber notificações do Concord</p>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ enabled: !notifications.settings.enabled })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.enabled ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.enabled ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Notificações na área de trabalho</p>
                      <p className="text-xs text-muted-foreground">Exibir pop-ups de notificação</p>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ desktopNotifications: !notifications.settings.desktopNotifications })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.desktopNotifications ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.desktopNotifications ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Mostrar prévia da mensagem</p>
                      <p className="text-xs text-muted-foreground">Exibir conteúdo na notificação</p>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ showPreview: !notifications.settings.showPreview })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.showPreview ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.showPreview ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl bg-channels p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3 mb-6">
                  <BellRing className="size-5 text-primary" />
                  <h3 className="font-semibold">Tipos de notificação</h3>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="size-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Mensagens em servidores</p>
                        <p className="text-xs text-muted-foreground">Notificar de novas mensagens</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ messageNotifications: !notifications.settings.messageNotifications })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.messageNotifications ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.messageNotifications ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <UserRound className="size-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Mensagens diretas</p>
                        <p className="text-xs text-muted-foreground">Notificar de DMs de amigos</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ dmNotifications: !notifications.settings.dmNotifications })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.dmNotifications ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.dmNotifications ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Phone className="size-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Chamadas</p>
                        <p className="text-xs text-muted-foreground">Notificar de chamadas recebidas</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ callNotifications: !notifications.settings.callNotifications })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.callNotifications ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.callNotifications ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <UserPlus className="size-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Pedidos de amizade</p>
                        <p className="text-xs text-muted-foreground">Notificar de novos pedidos</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ friendRequestNotifications: !notifications.settings.friendRequestNotifications })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.friendRequestNotifications ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.friendRequestNotifications ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl bg-channels p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3 mb-6">
                  <Volume1 className="size-5 text-primary" />
                  <h3 className="font-semibold">Som das notificações</h3>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Sons ativados</p>
                      <p className="text-xs text-muted-foreground">Reproduzir sons de notificação</p>
                    </div>
                    <button type="button" onClick={() => notifications.saveSettings({ soundEnabled: !notifications.settings.soundEnabled })} className={`relative h-6 w-11 rounded-full transition-colors ${notifications.settings.soundEnabled ? "bg-primary" : "bg-message-input"}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications.settings.soundEnabled ? "left-6" : "left-1"}`} />
                    </button>
                  </label>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Volume de notificação</span>
                      <span className="text-sm text-muted-foreground">{notifications.settings.notificationVolume}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={notifications.settings.notificationVolume} onChange={(e) => notifications.saveSettings({ notificationVolume: Number(e.target.value) })} className="w-full accent-primary" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Volume de chamada</span>
                      <span className="text-sm text-muted-foreground">{notifications.settings.callVolume}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={notifications.settings.callVolume} onChange={(e) => notifications.saveSettings({ callVolume: Number(e.target.value) })} className="w-full accent-primary" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground block mb-2">Toque de notificação</span>
                    <div className="grid grid-cols-4 gap-2">
                      {(['default', 'chime', 'bell', 'pop'] as const).map((tone) => (
                        <button key={tone} type="button" onClick={() => notifications.saveSettings({ ringtone: tone })} className={`rounded-lg py-2.5 text-xs font-medium transition-all ${notifications.settings.ringtone === tone ? "bg-primary text-primary-foreground" : "bg-message-input hover:bg-accent"}`}>
                          {tone.charAt(0).toUpperCase() + tone.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
