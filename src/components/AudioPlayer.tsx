import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

type Props = {
  src: string;
  duration?: number;
};

export function AudioPlayer({ src, duration: initialDuration }: Props) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (!initialDuration) setDuration(audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [initialDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
    setPlaying(!playing);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#2b2d31] p-3 min-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
      >
        {playing ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
      </button>

      <div className="flex-1">
        {/* Barra de progresso */}
        <div className="relative h-2 rounded-full bg-[#404249] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#5865F2] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Tempo */}
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Volume2 className="size-4 text-gray-400 shrink-0" />
    </div>
  );
}
