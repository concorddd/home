import { useRef, useState } from "react";
import { X, Loader2, Camera, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ServerMedia } from "@/components/ServerMedia";

type Server = { id: string; name: string; icon_url: string | null; owner_id: string };

function videoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    el.src = URL.createObjectURL(file);
  });
}

export function ServerSettingsModal({
  server,
  onClose,
  onChanged,
  onDeleted,
}: {
  server: Server;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("servers")
      .update({ name: name.trim() })
      .eq("id", server.id);
    setSaving(false);
    if (error) setError(error.message);
    else {
      setSaved(true);
      onChanged();
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      if (file.type.startsWith("video/")) {
        const dur = await videoDuration(file);
        if (dur > 5.5) throw new Error("O vídeo precisa ter no máximo 5 segundos.");
      }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${server.id}/icon-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("server-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("server-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? null;
      const { error: dbErr } = await supabase
        .from("servers")
        .update({ icon_url: url })
        .eq("id", server.id);
      if (dbErr) throw dbErr;
      setIcon(url);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Apagar o servidor "${server.name}"? Isso não pode ser desfeito.`)) return;
    const { error } = await supabase.from("servers").delete().eq("id", server.id);
    if (error) setError(error.message);
    else onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="surface-glass w-full max-w-md rounded-2xl border border-border/60 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Configurações do servidor</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="relative size-20 overflow-hidden rounded-2xl bg-channels">
            {icon ? (
              <ServerMedia url={icon} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-lg font-semibold">
                {server.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Trocar imagem do servidor"
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin text-white" />
              ) : (
                <Camera className="size-5 text-white" />
              )}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Imagem, GIF ou vídeo curto (máx. 5s).
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/webm"
              hidden
              onChange={(e) => void handleMedia(e)}
            />
          </div>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div>
            <label htmlFor="srv-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nome do servidor
            </label>
            <input
              id="srv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="w-full rounded-lg bg-message-input px-3 py-2 text-sm outline-none ring-1 ring-white/[0.06] focus:ring-primary/50"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-[#3ba55d]">Salvo!</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/25"
            >
              <Trash2 className="size-4" /> Apagar servidor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
