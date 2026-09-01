import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/convite/$code")({
  head: () => ({
    meta: [
      { title: "Convite — Concord" },
      { name: "description", content: "Entre em um servidor do Concord através de um convite." },
      { property: "og:title", content: "Convite — Concord" },
      { property: "og:description", content: "Você foi convidado para um servidor no Concord." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { code } = useParams({ from: "/_authenticated/convite/$code" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: serverId, error } = await supabase.rpc("join_server_by_invite", { _code: code });
      if (error || !serverId) {
        setError(error?.message ?? "Convite inválido ou expirado.");
        return;
      }
      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("server_id", serverId as string)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (channel?.id) navigate({ to: "/canais/$channelId", params: { channelId: channel.id }, replace: true });
      else navigate({ to: "/canais", replace: true });
    })();
  }, [code, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-servers px-4">
      <div className="animate-fade-up rounded-2xl bg-channels px-8 py-10 text-center shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]">
        {error ? (
          <>
            <h1 className="text-balance-tight text-lg font-bold">Convite inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate({ to: "/canais" })}
              className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90"
            >
              Voltar
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Entrando no servidor…
          </p>
        )}
      </div>
    </main>
  );
}
