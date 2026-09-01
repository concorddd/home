import { useRef, useState } from "react";
import { Loader2, Plus, Send, Smile, X } from "lucide-react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { formatBytes, uploadAttachment, type UploadedAttachment } from "@/lib/attachments";
import { useAuth } from "@/hooks/useAuth";

export function ChatInput({
  placeholder,
  onSend,
}: {
  placeholder: string;
  onSend: (payload: { content: string; attachment: UploadedAttachment | null }) => Promise<void>;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if ((!content && !file) || !user || sending) return;
    setSending(true);
    setError(null);
    try {
      let attachment: UploadedAttachment | null = null;
      if (file) {
        setProgress(0);
        attachment = await uploadAttachment(file, user.id, setProgress);
      }
      await onSend({ content, attachment });
      setDraft("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setProgress(null);
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:pb-8">
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-message-input px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {file.name}{" "}
            <span className="text-muted-foreground">({formatBytes(file.size)})</span>
          </span>
          {progress !== null ? (
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : (
            <button
              type="button"
              aria-label="Remover anexo"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          )}
          {progress !== null && (
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {progress}%
            </span>
          )}
        </div>
      )}

      <div className="relative flex items-center gap-3 rounded-2xl bg-message-input px-4 py-3 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.04] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:ring-primary/50">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setError(null);
            setFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Anexar arquivo"
          title="Anexar arquivo (até 1GB)"
          className="shrink-0 rounded-full bg-accent/70 p-1 text-muted-foreground transition-all hover:scale-110 hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label="Mensagem"
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
        />

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label="Emojis"
            className="text-muted-foreground transition-all hover:scale-110 hover:text-primary"
          >
            <Smile className="size-5" />
          </button>
          {emojiOpen && (
            <EmojiPicker
              onSelect={(emoji) => setDraft((d) => d + emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={sending}
          aria-label="Enviar"
          className="shrink-0 text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-primary active:scale-95 disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </button>
      </div>
    </form>
  );
}
