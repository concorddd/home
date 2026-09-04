import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, Mic, Settings, Users } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { StatusDot } from "@/components/StatusDot";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { GuidedTour } from "@/components/GuidedTour";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useNotifications } from "@/hooks/useNotifications";
import { useDmInbox, UnreadBadge } from "@/hooks/useInbox";

export function DirectSidebar({ activeUserId }: { activeUserId?: string | null }) {
  const { profile, user } = useAuth();
  const { friends, incoming } = useFriends();
  const { playNotificationSound, notifyFriendRequest } = useNotifications(user?.id);
  const { summaries } = useDmInbox();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Som + notificação quando chega um novo pedido de amizade
  const prevIncomingRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevIncomingRef.current === null) {
      prevIncomingRef.current = incoming.length;
      return;
    }
    if (incoming.length > prevIncomingRef.current) {
      playNotificationSound();
      const latest = incoming[0]?.profile;
      notifyFriendRequest(latest?.display_name || latest?.username || "Alguém");
    }
    prevIncomingRef.current = incoming.length;
  }, [incoming, playNotificationSound, notifyFriendRequest]);

  const ordered = friends
    .filter((f) => f.profile)
    .slice()
    .sort((a, b) => {
      const at = summaries[a.profile!.id]?.lastAt ?? "";
      const bt = summaries[b.profile!.id]?.lastAt ?? "";
      return bt.localeCompare(at);
    });

  return (
    <aside className="flex w-[16rem] max-w-[70vw] shrink-0 flex-col border-r border-border/60 bg-channels md:w-60 md:max-w-none">
      <header className="flex h-14 items-center border-b border-border/60 px-4">
        <span className="truncate text-[15px] font-semibold tracking-tight">Concord</span>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <Link
          to="/amigos"
          data-tour="friends"
          className="relative mb-4 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
        >
          <Users className="size-4" />
          <span className="flex-1">Amigos</span>
          <UnreadBadge count={incoming.length} />
        </Link>

        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Mensagens diretas
        </p>
        <ul className="space-y-1">
          {ordered.length === 0 && (
            <li className="px-2 py-1 text-xs leading-relaxed text-muted-foreground">
              Adicione amigos para começar uma conversa privada.
            </li>
          )}
          {ordered.map((f) => {
            const p = f.profile!;
            const summary = summaries[p.id];
            const unread = activeUserId === p.id ? 0 : (summary?.unread ?? 0);
            return (
              <li key={f.id}>
                <Link
                  to="/dm/$userId"
                  params={{ userId: p.id }}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                    activeUserId === p.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <span className="relative shrink-0">
                    <UserAvatar username={p.username} avatarUrl={p.avatar_url} />
                    <StatusDot
                      status={p.status}
                      ring="border-servers"
                      className="size-2.5"
                    />
                    <UnreadBadge count={unread} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground/90">
                      {p.display_name || p.username}
                    </span>
                    {summary?.lastContent && (
                      <span className="block truncate text-xs text-gray-400">
                        {summary.lastContent}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 bg-servers px-3 py-4">
        <div className="relative">
          <UserAvatar username={profile?.username ?? "?"} avatarUrl={profile?.avatar_url ?? null} />
          <StatusDot status={profile?.status} ring="border-servers" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight">
            {profile?.display_name || profile?.username || "—"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">@{profile?.username ?? "—"}</p>
        </div>
        <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
          <Mic className="size-4" />
        </button>
        <button className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
          <Headphones className="size-4" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          data-tour="settings"
          aria-label="Configurações do usuário"
          className="rounded p-1 text-muted-foreground transition-all duration-300 hover:rotate-45 hover:bg-accent/60 hover:text-foreground"
        >
          <Settings className="size-4" />
        </button>
      </div>

      {settingsOpen && <UserSettingsModal onClose={() => setSettingsOpen(false)} />}
      {!settingsOpen && <GuidedTour />}
    </aside>
  );
}
