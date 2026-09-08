import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { AtSign, Loader2, Phone, Video as VideoIcon, Users, Trash2, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCalls } from "@/hooks/useCalls";
import { useBlocking } from "@/hooks/useBlocking";
import { markDmRead } from "@/hooks/useInbox";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCached, readCache } from "@/lib/cache";
import { ServerRail } from "@/components/ServerRail";
import { DirectSidebar } from "@/components/DirectSidebar";
import { UserAvatar } from "@/components/UserAvatar";
import { ChatInput } from "@/components/ChatInput";
import { MessageAttachment } from "@/components/MessageAttachment";
import { MessageHoverMenu } from "@/components/MessageActions";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import { DateSeparator } from "@/components/DateSeparator";
import { SideDrawer, MenuButton, BottomNav, SwipeEdgeOpener } from "@/components/MobileShell";
import type { Peer } from "@/components/ProfilePanel";
import { UserProfileRightPanel } from "@/components/UserProfileRightPanel";
import { ProfileModalById } from "@/components/ProfileModalById";
import { MessageActionSheet } from "@/components/MessageActionSheet";
import { makeLongPressHandlers } from "@/hooks/useLongPress";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { AudioPlayer } from "@/components/AudioPlayer";
import { parseMarkdown } from "@/lib/markdown";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dm/$userId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mensagem direta - Concord" }] }),
  component: DirectMessagePage,
});


type Dm = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  is_pinned?: boolean;
  created_at: string;
};

function DirectMessagePage() {
  const { userId } = useParams({ from: "/_authenticated/dm/$userId" });
  const { user, profile } = useAuth();
  const sync = useRealtimeSync();
  const [peer, setPeer] = useCached<Peer | null>(`profile:${userId}`, null);
  const [isFriend, setIsFriend] = useCached<boolean | null>(`friend:${userId}`, null);
  const [messages, setMessages] = useCached<Dm[]>(`dm:${userId}`, []);
  const [loading, setLoading] = useState(true);
  const { startCall } = useCalls();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
  } | null>(null);

  // ---- Bloqueio (shadow ban) ----
  const { isBlocked, unblockUser } = useBlocking();
  const blocked = isBlocked(userId);
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleUnblock() {
    await unblockUser(userId);
  }

  function handleMessageContextMenu(e: React.MouseEvent, messageId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId });
  }

  // Extrai apenas dia/mês/ano para comparar entre mensagens consecutivas.
  function dateKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  useEffect(() => {
    void (async () => {
      // Tenta com colunas novas (bio, presença); se falharem (migration
      // pendente), refaz sem elas para o perfil nunca quebrar a conversa.
      const primary = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_color, bio, status, is_online, last_active_at, created_at")
        .eq("id", userId)
        .maybeSingle();
      if (primary.error) {
        const fb = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, status, created_at")
          .eq("id", userId)
          .maybeSingle();
        setPeer((fb.data as unknown as Peer) ?? null);
        return;
      }
      setPeer((primary.data as unknown as Peer) ?? null);
    })();
  }, [userId, sync, setPeer]);
useEffect(() => {
    if (!user) return;
    void (async () => {
      // RPC pode não existir em bancos antigos; cai para query direta.
      const { data, error } = await supabase.rpc("are_friends", { _a: user.id, _b: userId });
      if (error) {
        const { data: fr } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
          .limit(1);
        setIsFriend((fr?.length ?? 0) > 0);
        return;
      }
      setIsFriend(Boolean(data));
    })();
  }, [user, userId, sync, setIsFriend]);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    const baseSelect = "id, sender_id, recipient_id, content, attachment_url, attachment_name, attachment_type, attachment_size, is_pinned, created_at";
    const fallbackSelect = "id, sender_id, recipient_id, content, attachment_url, attachment_name, attachment_type, attachment_size, created_at";
    const orFilter = `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`;
    const primary = await supabase
      .from("direct_messages")
      .select(baseSelect)
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(60);
    let rows: Dm[] = [];
    if (primary.error) {
      // is_pinned pode não existir ainda (migration pendente)
      const fb = await supabase
        .from("direct_messages")
        .select(fallbackSelect)
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(60);
      rows = (fb.data as unknown as Dm[]) ?? [];
    } else {
      rows = (primary.data as unknown as Dm[]) ?? [];
    }
    setMessages(rows.slice().reverse());
    setLoading(false);
  }, [user, userId, setMessages]);

  useEffect(() => {
    setLoading(!readCache<Dm[]>(`dm:${userId}`));
    void fetchMessages();
  }, [userId, fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`dm:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as Dm;
        const mine = (row.sender_id === user?.id && row.recipient_id === userId) || (row.sender_id === userId && row.recipient_id === user?.id);
        if (!mine) return;
        // Shadow ban: mensagens novas de quem foi bloqueado não são renderizadas.
        if (blockedRef.current && row.sender_id === userId) return;
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, user?.id, setMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, userId]);

  async function handleSend({
    content,
    attachment,
  }: {
    content: string;
    attachment: { url: string; name: string; type: string; size: number; duration?: number } | null;
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

  function handleDeleteMessage(id: string) {
    // Remove otimistamente da UI e desfaz se o banco recusar.
    setMessages((prev) => prev.filter((m) => m.id !== id));
    void supabase
      .from("direct_messages")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) void fetchMessages();
      });
  }

  async function handleTogglePin(id: string, pinned: boolean) {
    // Cast necessário: coluna is_pinned ainda pode não estar nos types gerados.
    const { error } = await (
      supabase.from("direct_messages") as unknown as {
        update: (o: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ is_pinned: !pinned })
      .eq("id", id);
    if (!error) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_pinned: !pinned } : m)));
    }
  }

  async function handleClearConversation() {
    if (!user) return;
    if (!window.confirm(`Limpar toda a conversa com ${peerName}? Esta ação não pode ser desfeita.`)) return;
    setMessages([]);
    // RPC remove a conversa dos dois lados; se não existir, RLS deixa apagar
    // apenas as próprias mensagens.
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc("clear_conversation", { other_user_id: userId });
    if (error) {
      await supabase
        .from("direct_messages")
        .delete()
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`);
    }
  }

  const peerName = peer?.display_name || peer?.username || "usuario";
  // Shadow ban visual: mensagens de quem foi bloqueado não aparecem na tela,
  // mas o histórico continua intacto no banco (desbloquear restaura tudo).
  const visibleMessages = blocked ? messages.filter((m) => m.sender_id !== userId) : messages;
return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <SwipeEdgeOpener onOpen={() => setDrawerOpen(true)} />
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ServerRail homeActive />
        <DirectSidebar activeUserId={userId} />
      </SideDrawer>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-[64px] lg:pb-0">
        <header className="surface-glass relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-6">
          <MenuButton onClick={() => setDrawerOpen(true)} />
          <Link to="/amigos" aria-label="Voltar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground md:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <AtSign className="hidden size-5 text-muted-foreground md:block" />
          <UserAvatar username={peer?.username ?? "?"} avatarUrl={peer?.avatar_url ?? null} className="size-8 shrink-0 md:hidden" />
          <h1 className="min-w-0 truncate text-[15px] font-semibold">{peerName}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" title="Chamada de voz" disabled={isFriend === false} onClick={() => peer && void startCall(peer, false)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-40">
              <Phone className="size-5" />
            </button>
            <button type="button" title="Chamada de video" disabled={isFriend === false} onClick={() => peer && void startCall(peer, true)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-40">
              <VideoIcon className="size-5" />
            </button>
            <button
              type="button"
              title="Perfil"
              onClick={() => {
                // Mobile: abre o perfil do contato como bottom sheet.
                if (window.matchMedia("(min-width: 1024px)").matches) {
                  setProfilePanelOpen(!profilePanelOpen);
                } else {
                  setProfileUserId(userId);
                }
              }}
              className={`flex size-9 items-center justify-center rounded-lg transition-colors ${profilePanelOpen ? "bg-accent/40 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"}`}
            >
              <Users className="size-5" />
            </button>
            <button
              type="button"
              title="Limpar conversa"
              onClick={() => void handleClearConversation()}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-red-400"
            >
              <Trash2 className="size-5" />
            </button>
            <UserAvatar username={peer?.username ?? "?"} avatarUrl={peer?.avatar_url ?? null} className="ml-1 hidden size-8 md:flex" />
          </div>
        </header>
<div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando conversa...
            </p>
          ) : visibleMessages.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Este e o comeco da sua conversa com {peerName}.
            </p>
          ) : (
            visibleMessages.map((m, i) => {
              const mine = m.sender_id === user?.id;
              const showSeparator = i === 0 || dateKey(m.created_at) !== dateKey(visibleMessages[i - 1]!.created_at);
              return (
                <Fragment key={m.id}>
                  {showSeparator && <DateSeparator date={m.created_at} />}
                  <article
                    onContextMenu={(e) => handleMessageContextMenu(e, m.id)}
                    {...makeLongPressHandlers(() => setActionMessageId(m.id))}
                    className="animate-fade-up group -mx-2 flex gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-accent/25 active:bg-accent/40"
                  >
                    <button
                      type="button"
                      onClick={() => setProfileUserId(mine ? user?.id ?? null : userId)}
                      aria-label={`Abrir perfil de ${mine ? "você" : peerName}`}
                      className="shrink-0 rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
                    >
                      <UserAvatar
                        username={mine ? (profile?.username ?? "?") : (peer?.username ?? "?")}
                        avatarUrl={mine ? (profile?.avatar_url ?? null) : (peer?.avatar_url ?? null)}
                        className="size-10 shrink-0 user-select-none"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 user-select-none">
                        <button
                          type="button"
                          onClick={() => setProfileUserId(mine ? user?.id ?? null : userId)}
                          className="truncate text-sm font-semibold tracking-tight text-[#dbdee1] transition-colors hover:text-[#b5bac1] hover:underline"
                        >
                          {mine ? profile?.display_name || profile?.username || "Voce" : peerName}
                        </button>
                        <span className="text-[11px] tabular-nums text-[#949ba4]">
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </p>
                      {m.content && (
                        <div className="break-words text-[15px] leading-[1.6] text-[#dbdee1] user-select-text">
                          {parseMarkdown(m.content)}
                        </div>
                      )}
                      {m.attachment_type?.startsWith("audio/") && m.attachment_url && (
                        <AudioPlayer src={m.attachment_url} duration={m.attachment_size ?? undefined} />
                      )}
                      {m.attachment_url && !m.attachment_type?.startsWith("audio/") && (
                        <MessageAttachment
                          url={m.attachment_url}
                          name={m.attachment_name}
                          type={m.attachment_type}
                          size={m.attachment_size}
                        />
                      )}
                    </div>
                    <MessageHoverMenu
                      isOwn={mine}
                      isPinned={Boolean(m.is_pinned)}
                      onPin={() => handleTogglePin(m.id, Boolean(m.is_pinned))}
                      onDelete={() => handleDeleteMessage(m.id)}
                      onReply={() => {}}
                      onReact={() => {}}
                      onCopyLink={() => {
                        const link = `${window.location.origin}/dm/${userId}?msg=${m.id}`;
                        void navigator.clipboard.writeText(link);
                      }}
                      onMarkUnread={() => {}}
                      onForward={() => {}}
                      onMore={(e) => {
                        const rect = (e.currentTarget as HTMLElement)
                          .closest("article")
                          ?.getBoundingClientRect();
                        setContextMenu({
                          x: rect?.right ?? e.clientX,
                          y: rect?.top ?? e.clientY,
                          messageId: m.id,
                        });
                      }}
                    />
                  </article>
                </Fragment>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {blocked ? (
          <div className="shrink-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-xl bg-[#2b2d31]/70 px-6 py-5 text-center ring-1 ring-white/[0.04]">
              <p className="text-sm font-medium text-[#dbdee1]">Você bloqueou esta pessoa</p>
              <button
                onClick={() => void handleUnblock()}
                className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
              >
                Desbloquear {peerName}
              </button>
            </div>
          </div>
        ) : isFriend === false ? (
          <p className="px-4 pb-8 text-sm text-muted-foreground md:px-6">Voce precisa ser amigo para trocar mensagens privadas.</p>
        ) : (
          <ChatInput placeholder={`Conversar com ${peerName}`} onSend={handleSend} />
        )}
      </main>

            {profilePanelOpen && peer && (
        <UserProfileRightPanel
          profile={peer}
          isFriend={isFriend === true}
          onClose={() => setProfilePanelOpen(false)}
        />
      )}

      {profileUserId && (
        <ProfileModalById
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onFriendStateChange={(next) => {
            if (profileUserId === userId) setIsFriend(next === "friends");
          }}
        />
      )}

      {/* Bottom sheet de ações (long press) — mobile */}
      {actionMessageId && (
        <MessageActionSheet
          open
          onClose={() => setActionMessageId(null)}
          isOwn={messages.find((m) => m.id === actionMessageId)?.sender_id === user?.id}
          onReact={() => {}}
          onReply={() => {}}
          onForward={() => {}}
          onCopyText={() => {
            const msg = messages.find((m) => m.id === actionMessageId);
            if (msg?.content) void navigator.clipboard.writeText(msg.content);
          }}
          onPin={() => {
            const msg = messages.find((m) => m.id === actionMessageId);
            if (msg) void handleTogglePin(msg.id, Boolean(msg.is_pinned));
          }}
          onMarkUnread={() => {}}
          onCopyLink={() => {
            const link = `${window.location.origin}/dm/${userId}?msg=${actionMessageId}`;
            void navigator.clipboard.writeText(link);
          }}
          onSpeak={() => {
            const msg = messages.find((m) => m.id === actionMessageId);
            if (msg?.content && "speechSynthesis" in window) {
              const u = new SpeechSynthesisUtterance(msg.content);
              u.lang = "pt-BR";
              speechSynthesis.cancel();
              speechSynthesis.speak(u);
            }
          }}
          onReport={() => {}}
          onDelete={
            messages.find((m) => m.id === actionMessageId)?.sender_id === user?.id
              ? () => {
                  void handleDeleteMessage(actionMessageId);
                }
              : undefined
          }
        />
      )}

      <BottomNav
        onServers={() => setDrawerOpen(true)}
        onProfile={() => setSettingsOpen(true)}
      />
      {settingsOpen && <UserSettingsModal onClose={() => setSettingsOpen(false)} />}

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={messages.find((m) => m.id === contextMenu.messageId)?.sender_id === user?.id}
          onClose={() => setContextMenu(null)}
          onReact={() => {}}
          onReply={() => {}}
          onForward={() => {}}
          onCopyText={() => {
            const msg = messages.find((m) => m.id === contextMenu.messageId);
            if (msg?.content) void navigator.clipboard.writeText(msg.content);
          }}
          onPin={() => {
            const msg = messages.find((m) => m.id === contextMenu.messageId);
            if (msg) void handleTogglePin(msg.id, Boolean(msg.is_pinned));
          }}
          onMarkUnread={() => {}}
          onCopyLink={() => {
            const link = `${window.location.origin}/dm/${userId}?msg=${contextMenu.messageId}`;
            void navigator.clipboard.writeText(link);
          }}
          onSpeak={() => {
            const msg = messages.find((m) => m.id === contextMenu.messageId);
            if (msg?.content && "speechSynthesis" in window) {
              const u = new SpeechSynthesisUtterance(msg.content);
              u.lang = "pt-BR";
              speechSynthesis.cancel();
              speechSynthesis.speak(u);
            }
          }}
          onReport={() => {}}
          onDelete={
            messages.find((m) => m.id === contextMenu.messageId)?.sender_id === user?.id
              ? () => {
                  const msg = messages.find((m) => m.id === contextMenu.messageId);
                  if (msg) void handleDeleteMessage(msg.id);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
