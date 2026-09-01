import { createContext, useContext } from "react";

export type CallPeer = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CallStatus =
  | "idle"
  | "calling"
  | "incoming"
  | "connecting"
  | "active"
  | "error";

export type Signal =
  | { kind: "offer"; from: string; sdp: RTCSessionDescriptionInit; video: boolean }
  | { kind: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "reoffer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "reanswer"; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; candidate: RTCIceCandidateInit }
  | { kind: "end"; from: string }
  | { kind: "decline"; from: string };

export const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

export type ScreenQuality = "1080p60" | "1080p30" | "720p60" | "720p30";

export const SCREEN_QUALITIES: {
  id: ScreenQuality;
  label: string;
  hint: string;
  constraints: MediaTrackConstraints;
}[] = [
  {
    id: "1080p60",
    label: "1080p (FHD) a 60 FPS",
    hint: "Alta Qualidade",
    constraints: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
  },
  {
    id: "1080p30",
    label: "1080p (FHD) a 30 FPS",
    hint: "Padrão",
    constraints: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  },
  {
    id: "720p60",
    label: "720p (HD) a 60 FPS",
    hint: "Fluidez",
    constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
  },
  {
    id: "720p30",
    label: "720p (HD) a 30 FPS",
    hint: "Economia de Dados",
    constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  },
];

export type CallContextValue = {
  status: CallStatus;
  peer: CallPeer | null;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  remoteVideoOn: boolean;
  withVideo: boolean;
  minimized: boolean;
  sharing: boolean;
  localStreamRef: React.RefObject<MediaStream | null>;
  remoteStreamRef: React.RefObject<MediaStream | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  setMinimized: (v: boolean) => void;
  startCall: (peer: CallPeer, video: boolean) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  startScreenShare: (quality: ScreenQuality) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  dismissError: () => void;
};

const CallContext = createContext<CallContextValue | undefined>(undefined);

export { CallContext };

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCalls precisa estar dentro de CallProvider");
  return ctx;
}
