import { useEffect, useState } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot } from "@/components/StatusDot";
import { Phone } from "lucide-react";

type VoiceUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  is_online: boolean;
};

type Props = {
  channelId: string;
  channelName: string;
  compact?: boolean;
};

export function VoiceChannelPresence({ channelId, channelName, compact = false }: Props) {
  const [users, setUsers] = useState<VoiceUser[]>([]);

  useEffect(() => {
    // Buscar usuários no canal de voz
    const fetchVoiceUsers = async () => {
      try {
        const { data } = await (supabase as any)
          .from("voice_presence")
          .select("user_id, profiles(id, username, display_name, avatar_url, status, is_online)")
          .eq("channel_id", channelId);

        if (data) {
          const voiceUsers = (data as unknown as Array<{ user_id: string; profiles: { id: string; username: string; display_name: string | null; avatar_url: string | null; status: string; is_online: boolean } }>)
            .filter((row) => row.profiles)
            .map((row) => ({
              id: row.profiles.id,
              username: row.profiles.username,
              display_name: row.profiles.display_name,
              avatar_url: row.profiles.avatar_url,
              status: row.profiles.status || "online",
              is_online: row.profiles.is_online || true,
            }));
          setUsers(voiceUsers);
        }
      } catch {
        // Tabela pode não existir ainda
        setUsers([]);
      }
    };

    void fetchVoiceUsers();

    // Realtime subscription
    const channel = supabase
      .channel(`voice:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voice_presence",
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          void fetchVoiceUsers();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId]);

  if (users.length === 0) return null;

  return (
    <div className={`mt-1 ${compact ? "pl-2" : "pl-4"}`}>
      <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-1">
        <Phone className="size-3" />
        <span>{channelName}</span>
        <span className="text-gray-500">({users.length})</span>
      </div>
      <div className="space-y-0.5">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[#35373c] transition-colors group"
          >
            <div className="relative shrink-0">
              <UserAvatar
                username={u.username}
                avatarUrl={u.avatar_url}
                className="size-6 text-[10px]"
              />
              <SmartStatusDot
                status={u.status}
                isOnline={u.is_online}
                ring="border-[#2b2d31]"
                className="size-2.5 border"
              />
            </div>
            <span className="text-xs text-gray-300 truncate group-hover:text-white transition-colors">
              {u.display_name || u.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Hook para gerenciar presença em canal de voz
 */
export function useVoicePresence(channelId: string | null, userId: string | null) {
  useEffect(() => {
    if (!channelId || !userId) return;

    // Entrar no canal de voz
    const joinChannel = async () => {
      try {
        await (supabase as any).from("voice_presence").upsert(
          {
            channel_id: channelId,
            user_id: userId,
            joined_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,user_id" }
        );
      } catch {
        // Tabela pode não existir
      }
    };

    void joinChannel();

    // Sair do canal ao desmontar
    return () => {
      void (async () => {
        try {
          await (supabase as any)
            .from("voice_presence")
            .delete()
            .eq("channel_id", channelId)
            .eq("user_id", userId);
        } catch {
          // ignore
        }
      })();
    };
  }, [channelId, userId]);
}
