import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export type DmSummary = {
  peerId: string;
  lastContent: string;
  lastAt: string;
  unread: number;
};

const SEEN_PREFIX = "concord:seen:server:";

export function markServerSeen(serverId: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + serverId, new Date().toISOString());
  } catch {
    /* storage indisponível */
  }
}

function serverSeenAt(serverId: string) {
  try {
    return localStorage.getItem(SEEN_PREFIX + serverId) ?? "1970-01-01T00:00:00Z";
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

export async function markDmRead(peerId: string, selfId: string) {
  await supabase
    .from("direct_messages")
    .update({ read: true })
    .eq("recipient_id", selfId)
    .eq("sender_id", peerId)
    .eq("read", false);
}

/** Resumo das DMs: prévia da última mensagem e contador de não lidas por amigo. */
export function useDmInbox() {
  const { user } = useAuth();
  const sync = useRealtimeSync();
  const [summaries, setSummaries] = useState<Record<string, DmSummary>>({});

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("sender_id, recipient_id, content, attachment_name, created_at, read")
      .order("created_at", { ascending: false })
      .limit(300);

    const next: Record<string, DmSummary> = {};
    for (const row of data ?? []) {
      const peerId = row.sender_id === user.id ? row.recipient_id : row.sender_id;
      const preview = row.content?.trim()
        ? row.content
        : row.attachment_name
          ? `📎 ${row.attachment_name}`
          : "";
      const existing = next[peerId];
      if (!existing) {
        next[peerId] = {
          peerId,
          lastContent: preview,
          lastAt: row.created_at,
          unread: 0,
        };
      }
      if (!row.read && row.recipient_id === user.id) {
        next[peerId]!.unread += 1;
      }
    }
    setSummaries(next);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload, sync]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, reload]);

  return { summaries, reload };
}

/** Contador de novidades por servidor (baseado na última visita salva no dispositivo). */
export function useServerUnread(serverIds: string[]) {
  const { user } = useAuth();
  const sync = useRealtimeSync();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = serverIds.slice().sort().join(",");

  const reload = useCallback(async () => {
    if (!user || !key) {
      setCounts({});
      return;
    }
    const ids = key.split(",");
    const { data: channels } = await supabase
      .from("channels")
      .select("id, server_id")
      .in("server_id", ids);
    const channelServer = new Map((channels ?? []).map((c) => [c.id, c.server_id as string]));
    if (channelServer.size === 0) {
      setCounts({});
      return;
    }
    const { data: msgs } = await supabase
      .from("messages")
      .select("channel_id, created_at, user_id")
      .in("channel_id", [...channelServer.keys()])
      .order("created_at", { ascending: false })
      .limit(300);

    const next: Record<string, number> = {};
    for (const m of msgs ?? []) {
      if (m.user_id === user.id) continue;
      const serverId = channelServer.get(m.channel_id);
      if (!serverId) continue;
      if (m.created_at > serverSeenAt(serverId)) next[serverId] = (next[serverId] ?? 0) + 1;
    }
    setCounts(next);
  }, [user, key]);

  useEffect(() => {
    void reload();
  }, [reload, sync]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("server-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () =>
        void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, reload]);

  return counts;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-servers bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
