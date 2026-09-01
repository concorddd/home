import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessagesSquare, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ServerMedia } from "@/components/ServerMedia";
import { CreateServerModal } from "@/components/CreateServerModal";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCached, readCache, writeCache } from "@/lib/cache";
import { useServerUnread, UnreadBadge, markServerSeen } from "@/hooks/useInbox";

type Server = { id: string; name: string; icon_url: string | null; owner_id: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ServerRail({
  activeServerId,
  homeActive,
}: {
  activeServerId?: string | null;
  homeActive?: boolean;
}) {
  const navigate = useNavigate();
  const sync = useRealtimeSync();
  const [servers, setServers] = useCached<Server[]>("servers", []);
  const [createOpen, setCreateOpen] = useState(false);
  const unread = useServerUnread(servers.map((s) => s.id));

  const loadServers = useCallback(async () => {
    const { data } = await supabase
      .from("servers")
      .select("id, name, icon_url, owner_id")
      .order("created_at", { ascending: true });
    setServers((data as Server[]) ?? []);
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers, sync]);

  async function openServer(id: string) {
    markServerSeen(id);
    const cached = readCache<string>(`first-channel:${id}`);
    if (cached) {
      navigate({ to: "/canais/$channelId", params: { channelId: cached } });
      return;
    }
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("server_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      writeCache(`first-channel:${id}`, data.id);
      navigate({ to: "/canais/$channelId", params: { channelId: data.id } });
    }
  }

  return (
    <>
      <nav
        aria-label="Servidores"
        className="flex w-[72px] shrink-0 flex-col items-center gap-3 overflow-y-auto bg-servers py-4"
      >
        <button
          onClick={() => navigate({ to: "/amigos" })}
          title="Mensagens diretas"
          aria-label="Mensagens diretas"
          className={`flex size-12 shrink-0 items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            homeActive
              ? "rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)]"
              : "rounded-3xl bg-channels text-foreground hover:rounded-2xl hover:bg-primary hover:text-primary-foreground"
          }`}
        >
          <MessagesSquare className="size-6" />
        </button>
        <span className="h-px w-8 bg-border/70" />

        {servers.map((s) => (
          <div key={s.id} className="relative">
          <button
            onClick={() => void openServer(s.id)}
            title={s.name}
            className={`flex size-12 shrink-0 items-center justify-center overflow-hidden text-[13px] font-semibold tracking-tight transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              s.id === activeServerId
                ? "rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)]"
                : "rounded-3xl bg-channels text-foreground hover:rounded-2xl hover:bg-primary hover:text-primary-foreground"
            }`}
          >
            {s.icon_url ? (
              <ServerMedia url={s.icon_url} alt="" className="size-full object-cover" />
            ) : (
              initials(s.name)
            )}
          </button>
          <UnreadBadge count={s.id === activeServerId ? 0 : (unread[s.id] ?? 0)} />
          </div>
        ))}

        <button
          onClick={() => setCreateOpen(true)}
          data-tour="add-server"
          aria-label="Adicionar um servidor"
          title="Adicionar um servidor"
          className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-channels text-[#3ba55d] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:rounded-2xl hover:bg-[#3ba55d] hover:text-white"
        >
          <Plus className="size-6" />
        </button>
      </nav>

      {createOpen && (
        <CreateServerModal
          onClose={() => {
            setCreateOpen(false);
            void loadServers();
          }}
        />
      )}
    </>
  );
}
