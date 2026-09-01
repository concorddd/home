import { useEffect, useState } from "react";
import { X, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function randomCode() {
  return Math.random().toString(36).slice(2, 10);
}

export function InviteModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: existing } = await supabase
        .from("invites")
        .select("code")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.code) {
        if (active) setCode(existing.code);
        return;
      }
      if (!user) return;
      const { data, error } = await supabase
        .from("invites")
        .insert({ code: randomCode(), server_id: serverId, created_by: user.id })
        .select("code")
        .single();
      if (!active) return;
      if (error) setError(error.message);
      else setCode(data.code);
    })();
    return () => {
      active = false;
    };
  }, [serverId, user]);

  const link = code ? `${window.location.origin}/convite/${code}` : "";

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
        <h2 className="text-balance-tight text-lg font-bold">Convidar amigos</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Compartilhe este link para que outra pessoa entre no seu servidor.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-lg bg-message-input p-2">
          <input
            readOnly
            value={link}
            placeholder="Gerando convite…"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <button
            disabled={!code}
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {!code ? (
              <Loader2 className="size-4 animate-spin" />
            ) : copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        {code && (
          <p className="mt-3 text-xs text-muted-foreground">
            Código: <span className="font-mono text-foreground">{code}</span>
          </p>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
