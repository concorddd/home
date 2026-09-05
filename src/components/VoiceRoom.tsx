import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVoicePresence } from "@/hooks/useVoicePresence";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  /** id do canal de voz */
  channelId: string;
  channelName: string;
  displayName: string;
  avatarUrl: string | null;
  onLeave: () => void;
  startVideo?: boolean;
};

type RemotePeer = {
  userId: string;
  name: string;
  avatar: string | null;
  micOn: boolean;
  camOn: boolean;
  stream: MediaStream | null;
};

type SignalMsg =
  | { kind: "offer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; candidate: RTCIceCandidateInit }
  | { kind: "bye"; from: string };

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Toca o áudio de um participante remoto. */
function PeerAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function ScreenSharePreview({ stream, onStop }: { stream: MediaStream; onStop: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
  }, [stream]);

  return (
    <div className="relative rounded-lg overflow-hidden bg-[#1e1f22] ring-2 ring-[#5865F2] lg:col-span-2 lg:row-span-2">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain min-h-[300px]"
      />
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-[#5865F2] rounded px-2 py-1">
        <MonitorUp className="h-4 w-4" />
        <span className="text-xs font-medium">Você está compartilhando sua tela</span>
      </div>
      <button
        onClick={onStop}
        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 rounded-full p-2 transition-colors"
        title="Parar de compartilhar"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Anexa um stream de vídeo ao elemento. */
function useVideoStream(stream: MediaStream | null) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);
  return ref;
}

export function VoiceRoom({
  channelId,
  channelName,
  displayName,
  avatarUrl,
  onLeave,
  startVideo = false,
}: Props) {
  const { user } = useAuth();
  const selfId = user?.id ?? "";

  // Registra presença no canal de voz
  useVoicePresence(channelId, selfId);

  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(startVideo);
  const [sharing, setSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const fallbackTimersRef = useRef<Map<string, number>>(new Map());
  const presenceRef = useRef<Record<string, PeerMeta>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; data: Uint8Array }>>(new Map());
  const speakingTimerRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const sharingRef = useRef<boolean>(false);
  const cancelledRef = useRef<boolean>(false);

  const send = useCallback(
    (to: string, msg: SignalMsg) => {
      void channelRef.current?.send({ type: "broadcast", event: "vsignal", payload: msg });
    },
    [],
  );

  const updatePresence = useCallback((partial: Partial<PeerMeta>) => {
    const current = presenceRef.current[selfId] ?? {
      user_id: selfId,
      name: displayName,
      avatar: avatarUrl,
      mic_on: micOn,
      cam_on: camOn,
    };
    presenceRef.current[selfId] = { ...current, ...partial };
    void channelRef.current?.track(presenceRef.current[selfId]);
  }, [avatarUrl, camOn, displayName, micOn, selfId]);

  // ---- timer da chamada ----
  useEffect(() => {
    const t = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ---- ciclo de vida de uma conexão peer ----
  const destroyPeer = useCallback((peerId: string) => {
    const timer = fallbackTimersRef.current.get(peerId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      fallbackTimersRef.current.delete(peerId);
    }
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      pcsRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
    setPeers((prev) => prev.filter((p) => p.userId !== peerId));
  }, []);

  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(peerId);
    if (!pending) return;
    pendingIceRef.current.delete(peerId);
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* candidato tardio */
      }
    }
  }, []);

  const createPeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE);
      pcsRef.current.set(peerId, pc);
      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));
      pc.onicecandidate = (ev) => {
        if (ev.candidate)
          send(peerId, { kind: "ice", from: selfId, candidate: ev.candidate.toJSON() });
      };
      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        setPeers((prev) =>
          prev.map((p) => (p.userId === peerId ? { ...p, stream: stream ?? p.stream } : p)),
        );
      };
      return pc;
    },
    [selfId, send],
  );

  const handleSignal = useCallback(
    async (msg: SignalMsg) => {
      if (!msg || !msg.from || msg.from === selfId) return;
      if (msg.kind === "bye") {
        destroyPeer(msg.from);
        return;
      }
      if (msg.kind === "offer") {
        let pc = pcsRef.current.get(msg.from);
        // Evita glare: se a negociação não está estável, recomeça como respondente
        if (pc && pc.signalingState !== "stable") {
          destroyPeer(msg.from);
          pc = undefined;
        }
        if (!pc) pc = createPeer(msg.from);
        try {
          await pc.setRemoteDescription(msg.sdp);
          await flushIce(msg.from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send(msg.from, { kind: "answer", from: selfId, sdp: answer });
        } catch {
          /* ignora falha de negociação */
        }
        return;
      }
      if (msg.kind === "answer") {
        const pc = pcsRef.current.get(msg.from);
        if (pc && pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(msg.sdp);
            await flushIce(msg.from, pc);
          } catch {
            /* ignora */
          }
        }
        return;
      }
      if (msg.kind === "ice") {
        const pc = pcsRef.current.get(msg.from);
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch {
            /* ignora */
          }
        } else {
          const list = pendingIceRef.current.get(msg.from) ?? [];
          list.push(msg.candidate);
          pendingIceRef.current.set(msg.from, list);
        }
      }
    },
    [createPeer, destroyPeer, flushIce, selfId, send],
  );

  const connectTo = useCallback(
    async (peerId: string) => {
      if (!selfId || pcsRef.current.has(peerId)) return;
      const pc = createPeer(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send(peerId, { kind: "offer", from: selfId, sdp: offer });
      } catch {
        /* ignora */
      }
    },
    [createPeer, selfId, send],
  );

  // ---- join com presence ----
  useEffect(() => {
    if (!selfId) return;
    let cancelled = false;

    const join = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: startVideo,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        camTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setMicOn(true);
        setCamOn(startVideo);

        const ch = supabase.channel(`voice:${channelId}`, {
          config: { presence: { key: selfId } },
        });
        channelRef.current = ch;

        ch.on("broadcast", { event: "vsignal" }, (payload) => {
          void handleSignal(payload["payload"] as SignalMsg);
        });

        ch.on("presence", { event: "sync" }, () => {
          const state = ch.presenceState() as Record<string, PeerMeta[]>;
          const others: PeerMeta[] = [];
          for (const uid of Object.keys(state)) {
            if (uid === selfId) continue;
            const metas = state[uid];
            if (metas?.length && metas[0]) others.push(metas[0]);
          }
          for (const m of others) {
            if (!pcsRef.current.has(m.user_id)) {
              void connectTo(m.user_id);
            }
          }
          const liveIds = new Set(others.map((m) => m.user_id));
          for (const id of Array.from(pcsRef.current.keys())) {
            if (!liveIds.has(id)) destroyPeer(id);
          }
        });

        ch.on("presence", { event: "leave" }, (payload) => {
          const meta = payload["leftPresences"] as unknown as PeerMeta[];
          for (const m of meta) {
            if (m.user_id !== selfId) destroyPeer(m.user_id);
          }
        });

        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void ch.track({
              user_id: selfId,
              name: displayName,
              avatar: avatarUrl,
              mic_on: true,
              cam_on: startVideo,
            });
            setConnecting(false);
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Erro ao acessar microfone/câmera: ${err.message}`
              : "Erro ao acessar microfone/câmera",
          );
          setConnecting(false);
        }
      }
    };

    void join();

    return () => {
      cancelledRef.current = true;
      const ch = channelRef.current;
      if (ch) {
        void ch.untrack();
        supabase.removeChannel(ch);
      }
      for (const id of Array.from(pcsRef.current.keys())) {
        send(id, { kind: "bye", from: selfId });
        destroyPeer(id);
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => {
        t.stop();
        t.onended = null;
      });
      if (speakingTimerRef.current) window.clearInterval(speakingTimerRef.current);
      analysersRef.current.clear();
      sharingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, selfId]);

  // ---- detecção de fala (speaking) ----
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyse = (s: MediaStream, peerId: string) => {
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      analysersRef.current.set(peerId, { analyser, data });
    };
    analyse(stream, selfId);

    speakingTimerRef.current = window.setInterval(() => {
      const next = new Set<string>();
      analysersRef.current.forEach(({ analyser, data }, id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (analyser as any).getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > 30) next.add(id);
      });
      setSpeaking(next);
    }, 200);

    return () => {
      if (speakingTimerRef.current) window.clearInterval(speakingTimerRef.current);
      void ctx.close();
    };
  }, [selfId]);

  // ---- controles ----
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    updatePresence({ mic_on: track.enabled });
  }, [updatePresence]);

  const toggleCam = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    if (camOn) {
      const track = camTrackRef.current;
      if (track) {
        track.stop();
        stream.removeTrack(track);
        camTrackRef.current = null;
      }
      pcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) pc.removeTrack(sender);
      });
      setCamOn(false);
      updatePresence({ cam_on: false });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = newStream.getVideoTracks()[0] ?? null;
        camTrackRef.current = track;
        if (track) {
          stream.addTrack(track);
          pcsRef.current.forEach((pc) => pc.addTrack(track, stream));
        }
        setCamOn(true);
        updatePresence({ cam_on: true });
      } catch {
        /* usuário negou */
      }
    }
  }, [camOn, updatePresence]);

  const toggleShare = useCallback(async () => {
    const isCurrentlySharing = sharingRef.current;
    
    if (isCurrentlySharing) {
      // Parar compartilhamento de tela
      const oldStream = screenStreamRef.current;
      if (oldStream) {
        oldStream.getTracks().forEach((t) => {
          t.stop();
          t.onended = null;
        });
      }
      screenStreamRef.current = null;
      setScreenStream(null);
      sharingRef.current = false;
      setSharing(false);
      
      // Restaurar câmera se estava ligada
      const camTrack = camTrackRef.current;
      if (camTrack) {
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && sender.track !== camTrack) {
            sender.replaceTrack(camTrack).catch(() => {});
          }
        });
      }
      return;
    }
    
    try {
      // Iniciar compartilhamento de tela
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      
      // Verificar se ainda está montado
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      
      screenStreamRef.current = stream;
      setScreenStream(stream);
      sharingRef.current = true;
      setSharing(true);
      
      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        // Substituir track de vídeo pela tela nos peers existentes
        pcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(screenTrack).catch(() => {});
          } else if (localStreamRef.current) {
            pc.addTrack(screenTrack, localStreamRef.current);
          }
        });
        
        screenTrack.onended = () => {
          const currentStream = screenStreamRef.current;
          if (currentStream) {
            currentStream.getTracks().forEach((t) => {
              t.onended = null;
            });
          }
          screenStreamRef.current = null;
          setScreenStream(null);
          sharingRef.current = false;
          setSharing(false);
          
          // Restaurar câmera
          const camTrack = camTrackRef.current;
          if (camTrack) {
            pcsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === "video");
              if (sender && sender.track !== camTrack) {
                sender.replaceTrack(camTrack).catch(() => {});
              }
            });
          }
        };
      }
    } catch {
      /* usuário cancelou */
    }
  }, []);

  const leaveCall = useCallback(() => {
    onLeave();
  }, [onLeave]);

  // ---- render ----
  if (connecting) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#313338] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5865F2] mb-4" />
        <p className="text-lg font-medium">Conectando...</p>
        <p className="text-sm text-gray-400 mt-1">{channelName}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#313338] text-white p-6">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg font-medium text-center">{error}</p>
        <button
          onClick={leaveCall}
          className="mt-6 px-6 py-2 bg-[#5865F2] hover:bg-[#4752C4] rounded-md font-medium transition-colors"
        >
          Voltar
        </button>
      </div>
    );
  }

  const localStream = localStreamRef.current;

  return (
    <div className="flex flex-col h-full bg-[#313338] text-white">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1f22]">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-400" />
          <span className="font-semibold">{channelName}</span>
          <span className="text-xs text-gray-500 ml-2">{formatClock(callSeconds)}</span>
        </div>
        <span className="text-xs text-gray-400">
          {peers.length + 1} participante{peers.length !== 0 ? "s" : ""}
        </span>
      </div>

      {/* grid de vídeo */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className={`grid gap-3 ${sharing ? "grid-cols-1 lg:grid-cols-2" : peers.length === 0 ? "grid-cols-1" : peers.length < 3 ? "grid-cols-2" : "grid-cols-3"}`}
        >
          {/* preview da tela compartilhada (destaque) */}
          {sharing && screenStream && (
            <ScreenSharePreview
              stream={screenStream}
              onStop={toggleShare}
            />
          )}

          {/* tile local */}
          <div
            className={`relative rounded-lg overflow-hidden bg-[#1e1f22] ${speaking.has(selfId) ? "ring-2 ring-[#23a55a]" : ""}`}
          >
            {camOn && localStream && !sharing ? (
              <video
                ref={(el) => {
                  if (el) el.srcObject = localStream;
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-48">
                <UserAvatar username={displayName} avatarUrl={avatarUrl} className="size-16" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
              <span className="text-xs font-medium">{displayName}</span>
              <span className="text-[10px] text-gray-400">Você</span>
            </div>
            {!micOn && (
              <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                <MicOff className="h-3 w-3" />
              </div>
            )}
            {sharing && (
              <div className="absolute top-2 right-2 bg-[#5865F2] rounded-full p-1">
                <MonitorUp className="h-3 w-3" />
              </div>
            )}
          </div>

          {/* peers */}
          {peers.map((peer) => (
            <div
              key={peer.userId}
              className={`relative rounded-lg overflow-hidden bg-[#1e1f22] ${speaking.has(peer.userId) ? "ring-2 ring-[#23a55a]" : ""}`}
            >
              {peer.camOn && peer.stream ? (
                <video
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el) el.srcObject = peer.stream;
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-48">
                  <UserAvatar username={peer.name} avatarUrl={peer.avatar} className="size-16" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
                <span className="text-xs font-medium">{peer.name}</span>
              </div>
              {!peer.micOn && (
                <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                  <MicOff className="h-3 w-3" />
                </div>
              )}
              <PeerAudio stream={peer.stream} />
            </div>
          ))}
        </div>
      </div>

      {/* controles */}
      <div className="flex items-center justify-center gap-3 py-4 border-t border-[#1e1f22]">
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full transition-colors ${micOn ? "bg-[#2b2d31] hover:bg-[#404249]" : "bg-red-500 hover:bg-red-600"}`}
          title={micOn ? "Desativar microfone" : "Ativar microfone"}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleCam}
          className={`p-3 rounded-full transition-colors ${camOn ? "bg-[#2b2d31] hover:bg-[#404249]" : "bg-red-500 hover:bg-red-600"}`}
          title={camOn ? "Desativar câmera" : "Ativar câmera"}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleShare}
          className={`p-3 rounded-full transition-colors ${sharing ? "bg-[#5865F2] hover:bg-[#4752C4]" : "bg-[#2b2d31] hover:bg-[#404249]"}`}
          title={sharing ? "Parar de compartilhar" : "Compartilhar tela"}
        >
          <MonitorUp className="h-5 w-5" />
        </button>
        <button
          onClick={leaveCall}
          className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
          title="Desligar"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

type PeerMeta = {
  user_id: string;
  name: string;
  avatar: string | null;
  mic_on: boolean;
  cam_on: boolean;
};

