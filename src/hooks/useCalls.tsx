import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { CallOverlay } from "@/components/CallOverlay";
import { CallContext, ICE, type CallContextValue, type CallPeer, type CallStatus, type ScreenQuality, type Signal } from "@/hooks/call-context";

export { useCalls, SCREEN_QUALITIES } from "@/hooks/call-context";
export type { CallPeer, CallStatus, ScreenQuality, CallContextValue };
import { SCREEN_QUALITIES } from "@/hooks/call-context";

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const selfId = user?.id ?? null;
  const {
    playCallRingtone,
    stopCallRingtone,
    playRingbackTone,
    stopRingbackTone,
  } = useNotifications(user?.id);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [endedBy, setEndedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [withVideo, setWithVideo] = useState(false);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [sharing, setSharing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const offerRef = useRef<RTCSessionDescriptionInit | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const outRef = useRef(new Map<string, RealtimeChannel>());
  const renegotiatingRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeSinceRef = useRef<number | null>(null);

  /** Registra o resultado da chamada como mensagem especial na DM. */
  const logCall = useCallback(
    async (event: "ended" | "missed", durationSec: number, startedAt: number | null) => {
      const peerId = peerRef.current?.id;
      if (!selfId || !peerId) return;
      try {
        await supabase.from("direct_messages").insert({
          sender_id: selfId,
          recipient_id: peerId,
          kind: "call",
          content: JSON.stringify({
            event,
            durationSec,
            startedAt: startedAt ? new Date(startedAt).toISOString() : null,
          }),
        });
      } catch {
        /* log de chamada é best-effort */
      }
    },
    [selfId],
  );

  // ---- sinalização: envia para o canal pessoal do destinatário ----
  const signal = useCallback(async (to: string, msg: Signal) => {
    let ch = outRef.current.get(to);
    if (!ch) {
      ch = supabase.channel(`user_calls_${to}`, {
        config: { broadcast: { self: false, ack: false } },
      });
      outRef.current.set(to, ch);
      await new Promise<void>((resolve) => {
        ch!.subscribe((st) => {
          if (st === "SUBSCRIBED") resolve();
        });
        setTimeout(resolve, 3000);
      });
    }
    await ch.send({ type: "broadcast", event: "signal", payload: msg });
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camTrackRef.current = null;
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    offerRef.current = null;
    renegotiatingRef.current = false;
    activeSinceRef.current = null;
    setRemoteVideoOn(false);
    setCamOn(false);
    setMicOn(true);
    setSharing(false);
    setMinimized(false);
  }, []);

  const endLocal = useCallback(() => {
    cleanup();
    setStatus("idle");
    setPeer(null);
    peerRef.current = null;
  }, [cleanup]);

  const hangUp = useCallback(() => {
    const to = peerRef.current?.id;
    const startedAt = activeSinceRef.current;
    const durationSec = startedAt
      ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      : 0;
    if (to) void signal(to, { kind: "end", from: selfId ?? "" });
    if (to) void logCall(startedAt ? "ended" : "missed", durationSec, startedAt);
    cleanup();
    setStatus("ended");
    setEndedBy("Você");
  }, [cleanup, logCall, selfId, signal]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* candidato tardio */
      }
    }
    pendingIceRef.current = [];
  }, []);

  // Renegociação é necessária quando uma trilha nova (ex.: tela/câmera) é
  // adicionada depois que a chamada já foi negociada — caso das chamadas de voz
  // que escalam para compartilhamento de tela sem ter um transceiver de vídeo.
  const renegotiate = useCallback(async () => {
    const pc = pcRef.current;
    const to = peerRef.current?.id;
    if (!pc || !to || !selfId || pc.signalingState !== "stable" || renegotiatingRef.current) return;
    renegotiatingRef.current = true;
    try {
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);
      await signal(to, { kind: "reoffer", from: selfId, sdp: offer });
    } catch {
      /* falha silenciosa na renegociação */
    } finally {
      renegotiatingRef.current = false;
    }
  }, [selfId, signal]);

  const createPeerConnection = useCallback(
    (remoteId: string) => {
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate)
          void signal(remoteId, {
            kind: "ice",
            from: selfId ?? "",
            candidate: ev.candidate.toJSON(),
          });
      };
      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (stream) remoteStreamRef.current = stream;
        if (remoteVideoRef.current && stream) remoteVideoRef.current.srcObject = stream;
        if (ev.track.kind === "video") {
          setRemoteVideoOn(!ev.track.muted);
          ev.track.onmute = () => setRemoteVideoOn(false);
          ev.track.onunmute = () => setRemoteVideoOn(true);
          ev.track.onended = () => setRemoteVideoOn(false);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.connectionState === "connected") {
          if (activeSinceRef.current === null) activeSinceRef.current = Date.now();
          setStatus("active");
        }
        if (pc.connectionState === "failed") {
          setError("A conexão falhou. Tente novamente.");
          setStatus("error");
        }
        if (pc.connectionState === "closed") endLocal();
      };
      return pc;
    },
    [endLocal, selfId, signal],
  );

  const getMedia = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: 1280, height: 720 } : false,
    });
    localStreamRef.current = stream;
    setMicOn(true);
    setCamOn(video);
    window.setTimeout(() => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }, 0);
    return stream;
  }, []);

  // ---- canal pessoal: recebe todas as chamadas destinadas a mim ----
  useEffect(() => {
    if (!selfId) return;
    const channel = supabase.channel(`user_calls_${selfId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as Signal;
        if (!msg || msg.from === selfId) return;
        const pc = pcRef.current;

        if (msg.kind === "offer") {
          if (pc || offerRef.current) {
            void signal(msg.from, { kind: "decline", from: selfId });
            return;
          }
          offerRef.current = msg.sdp;
          setWithVideo(msg.video);
          const { data } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", msg.from)
            .maybeSingle();
          const p = (data as CallPeer | null) ?? {
            id: msg.from,
            username: "usuário",
            display_name: null,
            avatar_url: null,
          };
          peerRef.current = p;
          setPeer(p);
          setError(null);
          setStatus("incoming");
          return;
        }
        if (msg.kind === "answer") {
          if (!pc || pc.currentRemoteDescription) return;
          await pc.setRemoteDescription(msg.sdp);
          await flushIce();
          setStatus((s) => (s === "active" ? s : "connecting"));
          return;
        }
        if (msg.kind === "reoffer") {
          const from = msg.from;
          if (!pc || pc.signalingState !== "stable") return;
          try {
            await pc.setRemoteDescription(msg.sdp);
            const reAnswer = await pc.createAnswer();
            await pc.setLocalDescription(reAnswer);
            await signal(from, { kind: "reanswer", from: selfId, sdp: reAnswer });
          } catch {
            /* ignora */
          }
          return;
        }
        if (msg.kind === "reanswer") {
          if (!pc || pc.signalingState !== "have-local-offer") return;
          try {
            await pc.setRemoteDescription(msg.sdp);
          } catch {
            /* ignora */
          }
          return;
        }
        if (msg.kind === "ice") {
          if (pc?.remoteDescription) {
            try {
              await pc.addIceCandidate(msg.candidate);
            } catch {
              /* ignora */
            }
          } else {
            pendingIceRef.current.push(msg.candidate);
          }
          return;
        }
        if (msg.kind === "decline") {
          setError(`${peerRef.current?.display_name || peerRef.current?.username || "O usuário"} recusou a chamada.`);
          cleanup();
          setStatus("error");
          return;
        }
        if (msg.kind === "end") {
          const who =
            peerRef.current?.display_name ||
            peerRef.current?.username ||
            "O outro usuário";
          cleanup();
          setPeer(null);
          peerRef.current = null;
          setStatus("ended");
          setEndedBy(who);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selfId, cleanup, endLocal, flushIce, renegotiate, signal]);

  // fecha canais de envio ao desmontar
  useEffect(() => {
    const map = outRef.current;
    return () => {
      map.forEach((ch) => void supabase.removeChannel(ch));
      map.clear();
    };
  }, []);

  // ---- sons da chamada ----
  // Ringback ("dum-dum… dum-dum") enquanto estou chamando alguém.
  useEffect(() => {
    if (status !== "calling") return;
    playRingbackTone();
    return () => stopRingbackTone();
  }, [status, playRingbackTone, stopRingbackTone]);

  // Toque de chamada recebida.
  useEffect(() => {
    if (status !== "incoming") return;
    playCallRingtone();
    return () => stopCallRingtone();
  }, [status, playCallRingtone, stopCallRingtone]);

  // Tela "X encerrou a chamada" some sozinha depois de alguns segundos.
  useEffect(() => {
    if (status !== "ended") return;
    const t = window.setTimeout(() => {
      setStatus("idle");
      setEndedBy(null);
      setPeer(null);
      peerRef.current = null;
    }, 5000);
    return () => window.clearTimeout(t);
  }, [status]);

  // Quem chama desiste se ninguém atender (45s), como no Discord.
  useEffect(() => {
    if (status !== "calling") return;
    const t = window.setTimeout(() => {
      const name =
        peerRef.current?.display_name || peerRef.current?.username || "O usuário";
      void logCall("missed", 0, null);
      cleanup();
      peerRef.current = null;
      setError(`${name} não respondeu.`);
      setStatus("error");
    }, 45000);
    return () => window.clearTimeout(t);
  }, [status, cleanup, logCall]);

  const startCall = useCallback(
    async (target: CallPeer, video: boolean) => {
      if (!selfId || pcRef.current) return;
      peerRef.current = target;
      setPeer(target);
      setWithVideo(video);
      setError(null);
      setStatus("calling");
      try {
        const stream = await getMedia(video);
        const pc = createPeerConnection(target.id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        await signal(target.id, { kind: "offer", from: selfId, sdp: offer, video });
      } catch (e) {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Acesso ao microfone/câmera negado pelo navegador."
            : "Não foi possível iniciar a chamada.",
        );
        cleanup();
        setStatus("error");
      }
    },
    [cleanup, createPeerConnection, getMedia, selfId, signal],
  );

  const accept = useCallback(async () => {
    const offer = offerRef.current;
    const target = peerRef.current;
    if (!offer || !target || !selfId) return;
    setStatus("connecting");
    try {
      const stream = await getMedia(withVideo);
      const pc = createPeerConnection(target.id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(offer);
      offerRef.current = null;
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await signal(target.id, { kind: "answer", from: selfId, sdp: answer });
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Acesso ao microfone/câmera negado pelo navegador."
          : "Não foi possível atender a chamada.",
      );
      cleanup();
      setStatus("error");
    }
  }, [cleanup, createPeerConnection, flushIce, getMedia, selfId, signal, withVideo]);

  const decline = useCallback(() => {
    const to = peerRef.current?.id;
    if (to && selfId) void signal(to, { kind: "decline", from: selfId });
    endLocal();
  }, [endLocal, selfId, signal]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(async () => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;
    if (!stream || !pc) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      const newTrack = cam.getVideoTracks()[0]!;
      stream.addTrack(newTrack);
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      let addedTrack = false;
      if (sender) await sender.replaceTrack(newTrack);
      else {
        pc.addTrack(newTrack, stream);
        addedTrack = true;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setCamOn(true);
      if (addedTrack) await renegotiate();
    } catch {
      setError("Acesso à câmera negado pelo navegador.");
    }
  }, [renegotiate]);

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    const screen = screenStreamRef.current;
    screenStreamRef.current = null;
    screen?.getTracks().forEach((t) => t.stop());
    setSharing(false);
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    const cam = camTrackRef.current;
    if (sender) await sender.replaceTrack(cam && cam.readyState === "live" ? cam : null);
    if (localVideoRef.current)
      localVideoRef.current.srcObject = localStreamRef.current;
    setCamOn(Boolean(cam && cam.readyState === "live" && cam.enabled));
  }, []);

  const startScreenShare = useCallback(
    async (quality: ScreenQuality) => {
      const pc = pcRef.current;
      if (!pc) return;
      const preset = SCREEN_QUALITIES.find((q) => q.id === quality)!;
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: preset.constraints,
          audio: false,
        });
        const screenTrack = screen.getVideoTracks()[0]!;
        screenStreamRef.current = screen;
        camTrackRef.current = localStreamRef.current?.getVideoTracks()[0] ?? null;

        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        let addedTrack = false;
        if (sender) await sender.replaceTrack(screenTrack);
        else if (localStreamRef.current) {
          pc.addTrack(screenTrack, localStreamRef.current);
          addedTrack = true;
        }

        screenTrack.onended = () => void stopScreenShare();
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        setSharing(true);
        setCamOn(true);
        // Chamadas de voz não têm transceiver de vídeo negociado: é preciso
        // renegociar a conexão para que o outro lado receba a trilha da tela.
        if (addedTrack) await renegotiate();
      } catch (e) {
        if (e instanceof Error && e.name === "NotAllowedError") return;
        setError("Não foi possível compartilhar a tela.");
      }
    },
    [renegotiate, stopScreenShare],
  );

  const dismissError = useCallback(() => {
    endLocal();
    setError(null);
  }, [endLocal]);

  const value: CallContextValue = {
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
    startCall,
    accept,
    decline,
    hangUp,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    dismissError,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}
