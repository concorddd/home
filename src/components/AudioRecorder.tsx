import { useState, useRef, useCallback } from "react";
import { Mic, Square, Send, X } from "lucide-react";

type Props = {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
};

export function AudioRecorder({ onSend, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch {
      onCancel();
    }
  }, [onCancel]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
  }, []);

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[#2b2d31] p-2">
        <audio
          src={URL.createObjectURL(audioBlob)}
          controls
          className="h-8 flex-1"
          style={{ filter: "invert(1) hue-rotate(180deg)" }}
        />
        <button
          onClick={handleSend}
          className="rounded-full bg-[#5865F2] p-2 text-white hover:bg-[#4752C4] transition-colors"
        >
          <Send className="size-4" />
        </button>
        <button
          onClick={onCancel}
          className="rounded-full bg-[#404249] p-2 text-white hover:bg-[#4e5058] transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!recording ? (
        <button
          onClick={startRecording}
          className="rounded-full bg-[#5865F2] p-3 text-white hover:bg-[#4752C4] transition-colors"
          title="Gravar áudio"
        >
          <Mic className="size-5" />
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-[#2b2d31] px-3 py-2">
          <span className="flex items-center gap-1 text-red-500 text-sm font-medium">
            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
            {formatTime(duration)}
          </span>
          <button
            onClick={stopRecording}
            className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600 transition-colors"
            title="Parar gravação"
          >
            <Square className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
