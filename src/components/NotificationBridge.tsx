import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { readCache } from "@/lib/cache";

type AuthorCache = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Bridge global de notificações: toca som + notificação desktop quando chega
 * mensagem direta de alguém ou mensagem em canal de servidor ("grupo"),
 * respeitando as preferências de notificação do usuário.
 */
export function NotificationBridge() {
  const { user } = useAuth();
  const { notifyDM, notifyMessage } = useNotifications(user?.id);
  const myChannelsRef = useRef<Set<string>>(new Set());
  const channelNamesRef = useRef<Map<string, string>>(new Map());

  // Canais dos servidores que eu participo (para filtrar mensagens de "grupos")
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: mems } = await supabase
        .from("server_members")
        .select("server_id")
        .eq("user_id", user.id);
      const serverIds = (mems ?? []).map((m) => m.server_id as string);
      if (!serverIds.length) {
        myChannelsRef.current = new Set();
        channelNamesRef.current = new Map();
        return;
      }
      const { data: chans } = await supabase
        .from("channels")
        .select("id, name, server_id")
        .in("server_id", serverIds);
      myChannelsRef.current = new Set((chans ?? []).map((c) => c.id as string));
      channelNamesRef.current = new Map((chans ?? []).map((c) => [c.id as string, c.name as string]));
    })();
  }, [user]);

  // Mensagens diretas
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("global-dm-notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as {
          sender_id: string;
          recipient_id: string;
          content: string;
          kind: string | null;
        };
        if (row.recipient_id !== user.id || row.sender_id === user.id) return;
        if (row.kind && row.kind !== "text") return; // logs de chamada não tocam som
        // Não notificar se estou com a conversa aberta e a aba visível
        if (
          document.visibilityState === "visible" &&
          window.location.pathname === `/dm/${row.sender_id}`
        ) {
          return;
        }
        const author = readCache<AuthorCache>(`profile:${row.sender_id}`);
        const name = author?.display_name || author?.username || "Alguém";
        notifyDM(name, row.content?.slice(0, 120) ?? "", row.sender_id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, notifyDM]);

  // Mensagens em canais de servidores
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("global-server-notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as {
          id: string;
          channel_id: string;
          content: string;
          user_id: string;
        };
        if (row.user_id === user.id) return;
        if (!myChannelsRef.current.has(row.channel_id)) return;
        if (
          document.visibilityState === "visible" &&
          window.location.pathname.startsWith(`/canais/${row.channel_id}`)
        ) {
          return;
        }
        const author = readCache<AuthorCache>(`profile:${row.user_id}`);
        const name = author?.display_name || author?.username || "Alguém";
        const channelName = channelNamesRef.current.get(row.channel_id) ?? "canal";
        notifyMessage(name, row.content?.slice(0, 120) ?? "", channelName, {
          channelId: row.channel_id,
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, notifyMessage]);

  return null;
}
