import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, Settings, PhoneOff, Users } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot } from "@/components/StatusDot";

type CallParticipant = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  isCameraOn: boolean;
};

type Props = {
  participants: CallParticipant[];
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  onSettings?: () => void;
  screenStream?: MediaStream | null;
  duration?: number;
};

export function CallInterface({
  participants,
  isMuted,
  isCameraOn,
  isScreenSharing,
  isDeafened,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleDeafen,
  onLeave,
  screenStream,
  duration = 0,
}: Props) {
  const [showScreenShare, setShowScreenShare] = useState(true);

  const formatDuration = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full">
      {isScreenSharing && screenStream && showScreenShare && (
        <div className="relative border-b border-[#141517] bg-black p-2">
          <div className="relative mx-auto max-w-3xl aspect-video rounded-lg overflow-hidden ring-2 ring-[#f9a620]">
            <video autoPlay playsInline muted ref={(el) => { if (el) el.srcObject = screenStream; }} className="w-full h-full object-contain" />
            <div className="absolute top-2 left-2 flex items-center gap-2 bg-[#f9a620] rounded px-2 py-1">
              <MonitorUp className="size-3" />
              <span className="text-xs font-medium">Compartilhando tela</span>
            </div>
            <button onClick={() => setShowScreenShare(false)} className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">✕</button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#1a1b1e]">
        <div className={`flex flex-wrap justify-center gap-3 max-w-md ${participants.length > 4 ? "gap-2" : "gap-3"}`}>
          {participants.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <div className="relative">
                <UserAvatar username={p.username} avatarUrl={p.avatar_url} className={`border-2 ${p.isScreenSharing ? "border-[#f9a620]" : "border-transparent"} ${participants.length > 6 ? "size-12" : "size-16"}`} />
                <SmartStatusDot status={p.isMuted ? "ausente" : "online"} isOnline={true} ring="border-[#1a1b1e]" className="size-3.5 border-2" />
                {p.isMuted && (
                  <div className="absolute -bottom-1 -right-1 rounded-full bg-red-500 p-0.5">
                    <MicOff className="size-2.5 text-white" />
                  </div>
                )}
              </div>
              <span className="text-[11px] text-[#c7c8cc] truncate max-w-[60px]">{p.display_name || p.username}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-[#808287]">{formatDuration(duration)}</div>
      </div>

      <div className="flex justify-center pb-4 bg-[#1a1b1e]">
        <div className="flex items-center gap-1 rounded-full bg-[#141517] px-2 py-1.5 shadow-xl border border-[#242629]">
          <ControlButton active={!isMuted} onClick={onToggleMute} title={isMuted ? "Ativar microfone" : "Desativar microfone"}>
            {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </ControlButton>
          <ControlButton active={isCameraOn} onClick={onToggleCamera} title={isCameraOn ? "Desligar câmera" : "Ligar câmera"}>
            {isCameraOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </ControlButton>
          <ControlButton active={isScreenSharing} onClick={onToggleScreenShare} title={isScreenSharing ? "Parar compartilhamento" : "Compartilhar tela"}>
            <MonitorUp className="size-5" />
          </ControlButton>
          <ControlButton active={!isDeafened} onClick={onToggleDeafen} title={isDeafened ? "Ativar áudio" : "Desativar áudio"}>
            <Settings className="size-5" />
          </ControlButton>
          <div className="w-px h-6 bg-[#282a2e] mx-1" />
          <button onClick={onLeave} className="flex items-center justify-center rounded-full bg-[#da373c] px-4 py-2.5 text-white hover:bg-[#a12d31] transition-colors" title="Desligar">
            <PhoneOff className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`flex size-11 items-center justify-center rounded-full transition-colors ${active ? "bg-[#282a2e] text-white hover:bg-[#3a3d42]" : "bg-[#282a2e] text-[#808287] hover:bg-[#282a2e] hover:text-[#c7c8cc]"}`}>
      {children}
    </button>
  );
}
