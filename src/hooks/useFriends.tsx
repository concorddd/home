import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export type FriendProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
};

export type FriendRequest = {
  id: string;
  status: string;
  requester_id: string;
  addressee_id: string;
  profile: FriendProfile | null;
};

export function useFriends() {
  const { user } = useAuth();
  const sync = useRealtimeSync();
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id")
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    const otherIds = [
      ...new Set(rows.map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id))),
    ];
    let byId = new Map<string, FriendProfile>();
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, status")
        .in("id", otherIds);
      byId = new Map(((profs as FriendProfile[]) ?? []).map((p) => [p.id, p]));
    }
    const mapped: FriendRequest[] = rows.map((r) => ({
      ...r,
      profile: byId.get(r.requester_id === user.id ? r.addressee_id : r.requester_id) ?? null,
    }));
    setFriends(mapped.filter((r) => r.status === "accepted"));
    setIncoming(mapped.filter((r) => r.status === "pending" && r.addressee_id === user.id));
    setOutgoing(mapped.filter((r) => r.status === "pending" && r.requester_id === user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload, sync]);

  return { friends, incoming, outgoing, loading, reload };
}
