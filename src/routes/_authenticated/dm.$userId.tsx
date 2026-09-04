import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Loader2, Phone, Video as VideoIcon, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCalls } from "@/hooks/useCalls";
import { markDmRead } from "@/hooks/useInbox";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCached, readCache } from "@/lib/cache";
import { ServerRail } from "@/components/ServerRail";
import { DirectSidebar } from "@/components/DirectSidebar";
import { UserAvatar } from "@/components/UserAvatar";
import { ChatInput } from "@/components/ChatInput";
import { MessageAttachment } from "@/components/MessageAttachment";
import { SideDrawer, MenuButton } from "@/components/MobileShell";
import { ProfilePanel } from "@/components/ProfilePanel";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dm/$userId")({
  head: () => ({
    meta: [
      { title: "Mensagem direta — Concord" },
      {
        name: "description",
        content: "Conversa privada 1-a-1 no Concord, disponível entre amigos confirmados.",
      },
      { property: "og:title", content: "Mensagem direta — Concord" },
      {
        property: "og:description",
        content: "Converse em privado com seus amigos no Concord, com anexos e emojis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectMessagePage,
});

type Peer = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  status: string;
  is_online?: boolean;
  last_active_at?: string;
  created_at: string;
};

type Dm = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
};

function DirectMessagePage() {
  const { userId } = useParams({ from: "/_authenticated/dm/$userId" });
  const { user, profile } = useAuth();
  const sync = useRealtimeSync();
  const [peer, setPeer] = useCached<Peer | null>(`profile:${userId}`, null);
  const [isFriend, setIsFriend] = useCached<boolean | null>(`friend:${userId}`, null);
  const [messages, setMessages, hadMessages] = useCached<Dm[]>(`dm:${userId}`, []);
  const [loading, setLoading] = useState(!hadMessages);
  const { startCall } = useCalls();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, status, is_online, last_active_at, created_at")
        .eq("id", userId)
        .maybeSingle();
      setPeer((data as unknown as Peer) ?? null);
    })();
  }, [userId, sync, setPeer]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.rpc("are_friends", { _a: user.id, _b: userId });
      setIsFriend(Boolean(data));
    })();
  }, [user, userId, sync, setIsFriend]);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("direct_messages")
      .select(
        "id, sender_id, recipient_id, content, attachment_url, attachment_name, attachment_type, attachment_size, created_at",
      )
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: false })
      .limit(60);
    setMessages(((data as Dm[]) ?? []).slice().reverse());
    setLoading(false);
  }, [user, userId, setMessages]);

  useEffect(() => {
    setLoading(!readCache<Dm[]>(`dm:${userId}`));
    void fetchMessages();
  }, [userId, fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`dm:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as Dm;
          const mine =
            (row.sender_id === user?.id && row.recipient_id === userId) ||
            (row.sender_id === userId && row.recipient_id === user?.id);
          if (!mine) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, user?.id, setMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, userId]);

  async function handleSend({
    content,
    attachment,
  }: {
    content: string;
    attachment: { url: string; name: string; type: string; size: number } | null;
  }) {
    if (!user) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: userId,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
    });
    if (error) throw new Error(error.message);
    void fetchMessages();
  }

  useEffect(() => {
    if (!user) return;
    void markDmRead(userId, user.id);
  }, [user, userId, messages.length]);

  const peerName = peer?.display_name || peer?.username || "usuário";

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ServerRail homeActive />
        <DirectSidebar activeUserId={userId} />
      </SideDrawer>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="surface-glass relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-6">
          <MenuButton onClick={() => setDrawerOpen(true)} />
          <Link
            to="/amigos"
            aria-label="Voltar"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <AtSign className="hidden size-5 text-muted-foreground md:block" />
          <UserAvatar
            username={peer?.username ?? "?"}
            avatarUrl={peer?.avatar_url ?? null}
            className="size-8 shrink-0 md:hidden"
          />
          <h1 className="min-w-0 truncate text-[15px] font-semibold">{peerName}</h1>
          {peer && <span className="hidden text-xs text-muted-foreground md:inline">@{peer.username}</span>}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Chamada de voz"
              aria-label="Chamada de voz"
              disabled={isFriend === false}
              onClick={() => peer && void startCall(peer, false)}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
            >
              <Phone className="size-5" />
            </button>
            <button
              type="button"
              title="Chamada de vídeo"
              aria-label="Chamada de vídeo"
              disabled={isFriend === false}
              onClick={() => peer && void startCall(peer, true)}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
            >
              <VideoIcon className="size-5" />
            </button>
            <UserAvatar
              username={peer?.username ?? "?"}
              avatarUrl={peer?.avatar_url ?? null}
              className="ml-1 hidden size-8 md:flex"
            />
            <button
              type="button"
              title="Perfil"
              aria-label="Perfil"
              onClick={() => setProfilePanelOpen(!profilePanelOpen)}
              className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
                profilePanelOpen
                  ? "bg-accent/40 text-foreground"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              }`}
            >
              <Users className="size-5" />
            </button>
          </div>
        </header>


        <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6 md:py-6">

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando conversa…
            </p>
          ) : messages.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Este é o começo da sua conversa com {peerName}.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <article key={m.id} className="animate-fade-up group -mx-2 flex gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-accent/25">
                  <UserAvatar
                    username={mine ? (profile?.username ?? "?") : (peer?.username ?? "?")}
                    avatarUrl={mine ? (profile?.avatar_url ?? null) : (peer?.avatar_url ?? null)}
                    className="size-10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold tracking-tight">
                        {mine ? profile?.display_name || profile?.username || "Você" : peerName}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    {m.content && (
                      <p className="break-words text-[15px] leading-[1.6] text-foreground/90">
                        {m.content}
                      </p>
                    )}
                    {m.attachment_url && (
                      <MessageAttachment
                        url={m.attachment_url}
                        name={m.attachment_name}
                        type={m.attachment_type}
                        size={m.attachment_size}
                      />
                    )}
                  </div>
                </article>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {isFriend === false ? (
          <p className="px-4 pb-8 text-sm text-muted-foreground md:px-6">
            Vocês precisam ser amigos para trocar mensagens privadas.
          </p>
        ) : (
          <ChatInput placeholder={`Conversar com ${peerName}`} onSend={handleSend} />
        )}
      </main>

      {/* Painel de perfil */}
      {profilePanelOpen && peer && (
        <ProfilePanel
          profile={peer}
          onClose={() => setProfilePanelOpen(false)}
        />
      )}
    </div>
  );
}
