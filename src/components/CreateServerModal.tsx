import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goToServer(serverId: string) {
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", serverId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    onClose();
    if (data?.id) navigate({ to: "/canais/$channelId", params: { channelId: data.id } });
    else navigate({ to: "/canais" });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_server", { _name: name.trim() });
    setBusy(false);
    if (error || !data) return setError(error?.message ?? "Não foi possível criar o servidor.");
    await goToServer(data as string);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const raw = code.trim();
    const parsed = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;
    const { data, error } = await supabase.rpc("join_server_by_invite", { _code: parsed });
    setBusy(false);
    if (error || !data) return setError(error?.message ?? "Convite inválido.");
    await goToServer(data as string);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up relative w-full max-w-md rounded-2xl bg-channels p-6 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.05]"
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" />
        </button>

        <div className="mb-5 flex gap-1 rounded-lg bg-servers p-1">
          {(["create", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "create" ? "Criar servidor" : "Entrar com convite"}
            </button>
          ))}
        </div>

        {tab === "create" ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Dê um nome ao seu servidor. Um canal <span className="text-foreground">#geral</span> será
              criado automaticamente.
            </p>
            <input
              required
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meu servidor"
              className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Criar servidor
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Cole o código ou o link do convite que você recebeu.
            </p>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="abc123xy"
              className="w-full rounded-lg bg-message-input px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition-all focus:ring-primary/60"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3ba55d] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Entrar no servidor
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
