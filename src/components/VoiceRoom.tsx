import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import {
  DailyProvider,
  DailyAudio,
  DailyVideo,
  useDaily,
  useDailyEvent,
  useParticipantIds,
  useParticipantProperty,
  useActiveSpeakerId,
  useLocalSessionId,
  useScreenShare,
} from "@daily-co/daily-react";
import {
  Loader2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChannelCallCredentials, getDmCallCredentials } from "@/lib/daily.functions";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  /** id do canal de voz, ou id do amigo quando mode="dm" */
  channelId: string;
  channelName: string;
  displayName: string;
  avatarUrl: string | null;
  onLeave: () => void;
  mode?: "channel" | "dm";
  startVideo?: boolean;
};

export function VoiceRoom({
  channelId,
  channelName,
  displayName,
  avatarUrl,
  onLeave,
  mode = "channel",
  startVideo = false,
}: Props) {
  const fetchChannel = useServerFn(getChannelCallCredentials);
  const fetchDm = useServerFn(getDmCallCredentials);
  const [call, setCall] = useState<DailyCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let active = true;
    let instance: DailyCall | null = null;
    setError(null);
    setJoined(false);

    void (async () => {
      try {
        const creds =
          mode === "dm"
            ? await fetchDm({ data: { peerId: channelId, name: displayName } })
            : await fetchChannel({ data: { channelId, name: displayName } });
        if (!active) return;

        instance = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: startVideo,
        });
        setCall(instance);
        await instance.join({
          url: creds.url,
          token: creds.token,
          userName: displayName,
          startVideoOff: !startVideo,
          startAudioOff: false,
        });
        if (!active) return;
        setJoined(true);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao conectar");
      }
    })();

    return () => {
      active = false;
      const c = instance;
      if (c) {
        void c.leave().finally(() => void c.destroy());
      }
      setCall(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, displayName, mode, startVideo]);

  if (error) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <button
            onClick={onLeave}
            className="rounded-lg bg-[#383A40] px-4 py-2 text-sm font-medium transition-colors hover:bg-[#4a4d55]"
          >
            Voltar
          </button>
        </div>
      </Shell>
    );
  }

  if (!call || !joined) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Conectando à chamada…
        </div>
      </Shell>
    );
  }

  return (
    <DailyProvider callObject={call}>
      <div className="flex min-h-0 flex-1 flex-col bg-[#313338]">
        <DailyAudio />
        <VoiceStage channelName={channelName} localAvatar={avatarUrl} />
        <ControlDock onLeave={onLeave} onError={setError} />
      </div>
    </DailyProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#313338]">{children}</div>
  );
}

function VoiceStage({
  channelName,
  localAvatar,
}: {
  channelName: string;
  localAvatar: string | null;
}) {
  const ids = useParticipantIds();
  const screens = useParticipantIds({ filter: "screen" });
  const activeSpeakerId = useActiveSpeakerId();
  const localId = useLocalSessionId();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <p className="pb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Voz — {channelName} · {ids.length} {ids.length === 1 ? "participante" : "participantes"}
      </p>

      {screens.length > 0 && (
        <div className="mb-4 grid gap-4">
          {screens.map((id) => (
            <ScreenShareTile key={`screen-${id}`} sessionId={id} />
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ids.map((id) => (
          <ParticipantCard
            key={id}
            sessionId={id}
            speaking={id === activeSpeakerId}
            fallbackAvatar={id === localId ? localAvatar : null}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenShareTile({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // aplica volume/mudo no <audio> próprio da tela deste participante.
  // O DailyAudio monta o elemento dinamicamente, então re-tenta até encontrá-lo.
  useEffect(() => {
    let timer: number | undefined;
    const apply = () => {
      const el = document.querySelector<HTMLAudioElement>(
        `audio[data-session-id="${sessionId}"][data-audio-type="screenAudio"]`,
      );
      if (el) {
        el.volume = vol;
        el.muted = muted;
      }
      return Boolean(el);
    };
    if (!apply()) {
      timer = window.setInterval(() => {
        if (apply()) window.clearInterval(timer);
      }, 600);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [sessionId, vol, muted]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const video = containerRef.current?.querySelector("video");
    if (video) void video.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={containerRef}
      onClick={toggleFullscreen}
      className="group relative aspect-video cursor-pointer overflow-hidden rounded-xl bg-[#2B2D31] ring-1 ring-black/30"
    >
      <DailyVideo
        sessionId={sessionId}
        type="screenVideo"
        automirror={false}
        className="size-full object-contain"
      />

      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium">
        Compartilhamento de tela
      </span>

      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
      >
        <button
          onClick={() => setMuted((m) => !m)}
          title={muted ? "Ativar som da transmissão" : "Silenciar transmissão"}
          aria-label={muted ? "Ativar som da transmissão" : "Silenciar transmissão"}
          className="rounded-lg p-1.5 text-white transition-colors hover:bg-white/15"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(vol * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVol(v);
            if (v > 0 && muted) setMuted(false);
          }}
          className="w-24 cursor-pointer accent-[#5865f2]"
          title="Volume da transmissão"
          aria-label="Volume da transmissão"
        />
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="rounded-lg p-1.5 text-white transition-colors hover:bg-white/15"
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ParticipantCard({
  sessionId,
  speaking,
  fallbackAvatar,
}: {
  sessionId: string;
  speaking: boolean;
  fallbackAvatar: string | null;
}) {
  const [userName, videoState, audioState] = useParticipantProperty(sessionId, [
    "user_name",
    "tracks.video.state",
    "tracks.audio.state",
  ]);
  const name = userName || "Usuário";
  const videoOn = videoState === "playable";
  const micOn = audioState === "playable" || audioState === "sendable";

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl bg-[#2B2D31] transition-all duration-200 ${
        speaking ? "ring-2 ring-[#3ba55d]" : "ring-1 ring-black/30"
      }`}
    >
      {videoOn ? (
        <DailyVideo
          sessionId={sessionId}
          type="video"
          automirror
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <UserAvatar
            username={name}
            avatarUrl={fallbackAvatar}
            className={`size-20 text-lg ${
              speaking ? "ring-2 ring-[#3ba55d] ring-offset-2 ring-offset-[#2B2D31]" : ""
            }`}
          />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium">
        {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-destructive" />}
        <span className="max-w-[10rem] truncate">{name}</span>
      </div>
    </div>
  );
}

function ControlDock({
  onLeave,
  onError,
}: {
  onLeave: () => void;
  onError: (msg: string) => void;
}) {
  const daily = useDaily();
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const sync = useCallback(() => {
    if (!daily) return;
    setMicOn(daily.localAudio());
    setCamOn(daily.localVideo());
  }, [daily]);

  useEffect(sync, [sync]);
  useDailyEvent("participant-updated", sync);
  useDailyEvent(
    "camera-error",
    useCallback(() => {
      setMediaError("Acesso ao microfone/câmera negado pelo navegador.");
    }, []),
  );
  useDailyEvent(
    "error",
    useCallback(
      (ev: { errorMsg?: string }) => onError(ev.errorMsg ?? "Erro na chamada"),
      [onError],
    ),
  );

  const dock = useMemo(
    () => ({
      toggleMic: () => {
        daily?.setLocalAudio(!micOn);
        setMicOn(!micOn);
      },
      toggleCam: () => {
        daily?.setLocalVideo(!camOn);
        setCamOn(!camOn);
      },
      toggleScreen: () => (isSharingScreen ? stopScreenShare() : startScreenShare()),
    }),
    [daily, micOn, camOn, isSharingScreen, startScreenShare, stopScreenShare],
  );

  return (
    <div className="border-t border-black/30 bg-[#232428] px-6 py-3">
      {mediaError && <p className="pb-2 text-center text-xs text-destructive">{mediaError}</p>}
      <div className="flex items-center justify-center gap-3">
        <DockButton
          title={micOn ? "Desativar Microfone" : "Ativar Microfone"}
          active={!micOn}
          onClick={dock.toggleMic}
        >
          {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </DockButton>
        <DockButton
          title={camOn ? "Desativar Câmera" : "Ativar Câmera"}
          active={!camOn}
          onClick={dock.toggleCam}
        >
          {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </DockButton>
        <DockButton
          title={isSharingScreen ? "Parar Compartilhamento" : "Compartilhar Tela"}
          active={isSharingScreen}
          onClick={dock.toggleScreen}
        >
          <MonitorUp className="size-5" />
        </DockButton>
        <button
          onClick={onLeave}
          title="Desconectar"
          aria-label="Desconectar"
          className="flex size-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:brightness-110"
        >
          <PhoneOff className="size-5" />
        </button>
      </div>
    </div>
  );
}

function DockButton({
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
      className={`flex size-11 items-center justify-center rounded-full transition-colors ${
        active ? "bg-[#5865f2] hover:bg-[#6b76f5]" : "bg-[#383A40] hover:bg-[#4a4d55]"
      }`}
    >
      {children}
    </button>
  );
}
