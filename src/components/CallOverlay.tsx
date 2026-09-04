import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useCalls, SCREEN_QUALITIES, type ScreenQuality } from "@/hooks/call-context";

export function CallOverlay() {
  const {
    status,
    peer,
    endedBy,
    error,
    micOn,
    camOn,
    remoteVideoOn,
    withVideo,
    minimized,
    sharing,
    localStreamRef,
    remoteStreamRef,
    localVideoRef,
    remoteVideoRef,
    setMinimized,
    accept,
    decline,
    hangUp,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    dismissError,
  } = useCalls();

  const [menuOpen, setMenuOpen] = useState(false);
  const [remoteVol, setRemoteVol] = useState(1);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteFs, setRemoteFs] = useState(false);
  const { profile } = useAuth();
  const inCall = status === "active" || status === "connecting";

  // reanexa os streams sempre que o layout (cheio/minimizado) troca
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = remoteVol;
      remoteVideoRef.current.muted = remoteMuted;
    }
  }, [minimized, status, localStreamRef, remoteStreamRef, localVideoRef, remoteVideoRef, remoteVol, remoteMuted]);

  // alterna fullscreen da transmissão/vídeo remoto
  const toggleRemoteFullscreen = () => {
    const el = remoteVideoRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFs = () => setRemoteFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!inCall) setMenuOpen(false);
  }, [inCall]);

  if (status === "idle") return null;

  const peerName = peer?.display_name || peer?.username || "usuário";

  if (minimized && inCall) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="relative aspect-video bg-[#2B2D31]">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={remoteVideoOn ? "size-full object-cover" : "hidden"}
          />
          {!remoteVideoOn && (
            <div className="flex size-full items-center justify-center">
              <UserAvatar
                username={peer?.username ?? "?"}
                avatarUrl={peer?.avatar_url ?? null}
                className="size-14 text-base"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{peerName}</span>
          <button
            onClick={() => setMinimized(false)}
            title="Expandir chamada"
            aria-label="Expandir chamada"
            className="flex size-8 items-center justify-center rounded-lg bg-[#383A40] transition-colors hover:bg-[#4a4d55]"
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            onClick={hangUp}
            title="Encerrar chamada"
            aria-label="Encerrar chamada"
            className="flex size-8 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:brightness-110"
          >
            <PhoneOff className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] flex-col bg-[#1e1f22] sm:bg-[#313338]/98 sm:backdrop-blur-sm">
      <div className="relative min-h-0 flex-1 p-0 sm:p-6">
        {inCall && (
          <button
            onClick={() => setMinimized(true)}
            title="Minimizar chamada"
            aria-label="Minimizar chamada"
            className="absolute left-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            <ChevronDown className="size-5" />
          </button>
        )}

        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
            <button
              onClick={dismissError}
              className="rounded-lg bg-[#383A40] px-4 py-2 text-sm font-medium transition-colors hover:bg-[#4a4d55]"
            >
              Fechar
            </button>
          </div>
        ) : status === "calling" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <UserAvatar
              username={peer?.username ?? "?"}
              avatarUrl={peer?.avatar_url ?? null}
              className="size-24 animate-pulse text-xl"
            />
            <div>
              <p className="text-lg font-semibold">{peerName}</p>
              <p className="text-sm text-muted-foreground">
                Chamando… aguardando resposta
              </p>
            </div>
            <button
              onClick={hangUp}
              title="Encerrar chamada"
              aria-label="Encerrar chamada"
              className="mt-2 flex size-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105 sm:size-14"
            >
              <PhoneOff className="size-6" />
            </button>
          </div>
        ) : status === "incoming" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <UserAvatar
              username={peer?.username ?? "?"}
              avatarUrl={peer?.avatar_url ?? null}
              className="size-24 animate-pulse text-xl"
            />
            <div>
              <p className="text-lg font-semibold">{peerName}</p>
              <p className="text-sm text-muted-foreground">
                Chamada de {withVideo ? "vídeo" : "voz"} recebida…
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => void accept()}
                title="Aceitar"
                aria-label="Aceitar chamada"
                className="flex size-16 items-center justify-center rounded-full bg-[#3ba55d] text-white transition-transform hover:scale-105 sm:size-14"
              >
                <Phone className="size-6" />
              </button>
              <button
                onClick={decline}
                title="Recusar"
                aria-label="Recusar chamada"
                className="flex size-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105 sm:size-14"
              >
                <PhoneOff className="size-6" />
              </button>
            </div>
          </div>
        ) : status === "ended" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PhoneOff className="size-8 text-muted-foreground" />
            <p className="text-lg font-semibold">
              {endedBy === "Você"
                ? "Você encerrou a chamada."
                : `${endedBy ?? "A chamada"} encerrou a chamada.`}
            </p>
            <p className="text-sm text-muted-foreground">Esta tela fechará em instantes…</p>
          </div>
        ) : (
          <div className="relative h-full sm:grid sm:h-full sm:grid-cols-2 sm:gap-4">
            <div className="absolute inset-0 sm:static sm:group sm:relative">
              <Tile
                label={peerName}
                visible={remoteVideoOn}
                avatar={peer?.avatar_url ?? null}
                className={`h-full rounded-none sm:aspect-video sm:h-auto sm:rounded-xl ${remoteVideoOn ? "cursor-pointer" : ""}`}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  onClick={() => remoteVideoOn && toggleRemoteFullscreen()}
                  className="size-full object-cover"
                />
              </Tile>

              {remoteVideoOn && (
                <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-xl bg-black/65 px-2.5 py-2 text-white shadow-lg ring-1 ring-white/10 backdrop-blur">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoteMuted((m) => !m);
                    }}
                    title={remoteMuted ? "Ativar som" : "Silenciar"}
                    aria-label={remoteMuted ? "Ativar som" : "Silenciar"}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
                  >
                    {remoteMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(remoteVol * 100)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setRemoteVol(v);
                      if (v > 0 && remoteMuted) setRemoteMuted(false);
                    }}
                    className="w-20 cursor-pointer accent-[#5865f2]"
                    title="Volume"
                    aria-label="Volume da chamada"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRemoteFullscreen();
                    }}
                    title={remoteFs ? "Sair da tela cheia" : "Tela cheia"}
                    aria-label={remoteFs ? "Sair da tela cheia" : "Tela cheia"}
                    className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
                  >
                    {remoteFs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>
                </div>
              )}
            </div>
            <div className="absolute bottom-4 right-4 z-10 w-28 sm:static sm:w-auto">
              <Tile
                label="Você"
                username={profile?.username ?? "?"}
                visible={camOn}
                avatar={profile?.avatar_url ?? null}
                className="aspect-video rounded-xl shadow-xl"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`size-full object-cover ${sharing ? "" : "-scale-x-100"}`}
                />
              </Tile>
            </div>
          </div>
        )}

        {status === "connecting" && (
          <p className="flex items-center justify-center gap-2 pt-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Conectando…
          </p>
        )}
      </div>

      {status !== "incoming" && status !== "error" && status !== "calling" && status !== "ended" && (
        <div className="shrink-0 border-t border-black/30 bg-[#232428] px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="relative flex items-center justify-center gap-4 sm:gap-3">
            <Dock
              title={micOn ? "Desativar Microfone" : "Ativar Microfone"}
              active={!micOn}
              onClick={toggleMic}
            >
              {micOn ? <Mic className="size-6 sm:size-5" /> : <MicOff className="size-6 sm:size-5" />}
            </Dock>
            <Dock
              title={camOn ? "Desligar Câmera" : "Ligar Câmera"}
              active={!camOn}
              onClick={() => void toggleCam()}
            >
              {camOn ? <VideoIcon className="size-6 sm:size-5" /> : <VideoOff className="size-6 sm:size-5" />}
            </Dock>

            <div className="relative">
              <Dock
                title={sharing ? "Parar compartilhamento" : "Compartilhar Tela"}
                active={sharing}
                onClick={() => (sharing ? void stopScreenShare() : setMenuOpen((v) => !v))}
              >
                <MonitorUp className="size-6 sm:size-5" />
              </Dock>
              {menuOpen && !sharing && (
                <QualityMenu
                  onPick={(q) => {
                    setMenuOpen(false);
                    void startScreenShare(q);
                  }}
                  onClose={() => setMenuOpen(false)}
                />
              )}
            </div>

            <button
              onClick={hangUp}
              title="Encerrar chamada"
              aria-label="Encerrar chamada"
              className="flex size-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:brightness-110 sm:size-11"
            >
              <PhoneOff className="size-6 sm:size-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QualityMenu({
  onPick,
  onClose,
}: {
  onPick: (q: ScreenQuality) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="animate-fade-up absolute bottom-[calc(100%+0.75rem)] left-1/2 z-50 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
    >
      <p className="border-b border-gray-700 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Escolha a qualidade da transmissão
      </p>
      <ul className="p-1">
        {SCREEN_QUALITIES.map((q) => (
          <li key={q.id}>
            <button
              role="menuitem"
              onClick={() => onPick(q.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/10"
            >
              <span className="text-sm font-medium">{q.label}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{q.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({
  label,
  username,
  visible,
  avatar,
  className = "aspect-video rounded-xl",
  children,
}: {
  label: string;
  username?: string;
  visible: boolean;
  avatar: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-[#2B2D31] ring-1 ring-black/30 ${className}`}>
      <div className={visible ? "size-full" : "hidden"}>{children}</div>
      {!visible && (
        <div className="flex size-full items-center justify-center">
          <UserAvatar username={username ?? label} avatarUrl={avatar} className="size-20 text-lg" />
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium">
        {label}
      </span>
    </div>
  );
}

function Dock({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex size-16 items-center justify-center rounded-full transition-colors sm:size-11 ${
        active ? "bg-[#5865f2] hover:bg-[#6b76f5]" : "bg-[#383A40] hover:bg-[#4a4d55]"
      }`}
    >
      {children}
    </button>
  );
}
