import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, Mic, MicOff, Settings, Users } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot, StatusDot } from "@/components/StatusDot";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { GuidedTour } from "@/components/GuidedTour";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useNotifications } from "@/hooks/useNotifications";
import { useDmInbox, UnreadBadge } from "@/hooks/useInbox";
import { useCalls } from "@/hooks/call-context";

export function DirectSidebar({ activeUserId }: { activeUserId?: string | null }) {
  const { profile, user } = useAuth();
  const { selfMute, selfDeafen, toggleSelfMute, toggleSelfDeafen } = useCalls();
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
          className="relative mb-4 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
        >
          <Users className="size-4 text-[#949ba4]" />
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
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  }`}
                >
                  <span className="relative shrink-0">
                    <UserAvatar username={p.username} avatarUrl={p.avatar_url} />
                    <SmartStatusDot
                      status={p.status}
                      isOnline={p.is_online}
                      lastActiveAt={p.last_active_at}
                      ring="border-channels"
                      className="size-2.5"
                    />
                    <UnreadBadge count={unread} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {p.display_name || p.username}
                    </span>
                    {summary?.lastContent && (
                      <span className="block truncate text-xs text-muted-foreground">
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

      {/* Painel do usuário local — barra flutuante estilo composer */}
      <div className="px-2 pb-2 pt-1">
        <div className="flex h-[52px] items-center gap-2 rounded-lg bg-user-panel px-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.04]">
          <div className="relative shrink-0">
            <UserAvatar username={profile?.username ?? "?"} avatarUrl={profile?.avatar_url ?? null} />
            <StatusDot status={profile?.status} ring="border-user-panel" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium tracking-tight">
              {profile?.display_name || profile?.username || "—"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">@{profile?.username ?? "—"}</p>
          </div>
          <button
            onClick={toggleSelfMute}
            title={selfMute || selfDeafen ? "Ativar microfone" : "Silenciar microfone"}
            aria-label={selfMute || selfDeafen ? "Ativar microfone" : "Silenciar microfone"}
            className={`relative flex size-8 shrink-0 items-center justify-center rounded transition-colors ${
              selfMute || selfDeafen
                ? "text-[#f0553c] hover:bg-[#f0553c]/15"
                : "text-[#949ba4] hover:bg-accent/60 hover:text-[#dbdee1]"
            }`}
          >
            {selfMute || selfDeafen ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            onClick={toggleSelfDeafen}
            title={selfDeafen ? "Desativar mute total" : "Mute total (não escutar e não falar)"}
            aria-label={selfDeafen ? "Desativar mute total" : "Mute total"}
            className={`relative flex size-8 shrink-0 items-center justify-center rounded transition-colors ${
              selfDeafen
                ? "text-[#f0553c] hover:bg-[#f0553c]/15"
                : "text-[#949ba4] hover:bg-accent/60 hover:text-[#dbdee1]"
            }`}
          >
            <Headphones className="size-4" />
            {selfDeafen && (
              <span
                aria-hidden
                className="absolute h-[1.5px] w-[22px] -rotate-[40deg] rounded bg-current"
              />
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            data-tour="settings"
            aria-label="Configurações do usuário"
            className="flex size-8 shrink-0 items-center justify-center rounded text-[#949ba4] transition-all duration-300 hover:rotate-45 hover:bg-accent/60 hover:text-[#dbdee1]"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      {settingsOpen && <UserSettingsModal onClose={() => setSettingsOpen(false)} />}
      {!settingsOpen && <GuidedTour />}
    </aside>
  );
}
