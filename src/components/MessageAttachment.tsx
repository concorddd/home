import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/attachments";

export function MessageAttachment({
  url,
  name,
  type,
  size,
}: {
  url: string;
  name: string | null;
  type: string | null;
  size: number | null;
}) {
  const label = name ?? "arquivo";

  if (type?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block max-w-sm">
        <img
          src={url}
          alt={label}
          loading="lazy"
          className="max-h-72 rounded-xl object-cover ring-1 ring-white/[0.06]"
        />
      </a>
    );
  }

  if (type?.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        className="mt-2 max-h-72 max-w-sm rounded-xl ring-1 ring-white/[0.06]"
      />
    );
  }

  if (type?.startsWith("audio/")) {
    return <audio src={url} controls className="mt-2 w-full max-w-sm" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex max-w-sm items-center gap-2 rounded-xl bg-message-input px-3 py-2 text-sm transition-colors hover:bg-accent/60"
    >
      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {size != null && (
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span>
      )}
    </a>
  );
}
