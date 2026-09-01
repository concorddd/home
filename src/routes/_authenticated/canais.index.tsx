import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/canais/")({
  component: CanaisIndex,
});

function CanaisIndex() {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const { data: memberships } = await supabase
        .from("server_members")
        .select("server_id")
        .order("created_at", { ascending: true })
        .limit(1);
      const serverId = memberships?.[0]?.server_id;
      if (serverId) {
        const { data: channel } = await supabase
          .from("channels")
          .select("id")
          .eq("server_id", serverId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (channel?.id) {
          navigate({ to: "/canais/$channelId", params: { channelId: channel.id }, replace: true });
          return;
        }
      }
      // Sem servidores: o usuário vai direto para a tela inicial de amigos/DMs.
      navigate({ to: "/amigos", replace: true });
    })();
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-servers px-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </p>
    </main>
  );
}
