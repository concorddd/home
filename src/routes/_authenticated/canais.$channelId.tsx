import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import {
  Hash,
  Plus,
  UserPlus,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Loader2,
  Pencil,
  Trash2,
  Cog,
  Volume2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCalls } from "@/hooks/call-context";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot, StatusDot } from "@/components/StatusDot";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { InviteModal } from "@/components/InviteModal";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { ServerMedia } from "@/components/ServerMedia";
import { ServerRail } from "@/components/ServerRail";
import { SideDrawer, MenuButton, BottomNav, RightDrawer, SwipeEdgeOpener } from "@/components/MobileShell";
import { ChatInput } from "@/components/ChatInput";
import { MessageAttachment } from "@/components/MessageAttachment";
import { DateSeparator } from "@/components/DateSeparator";
import { MessageHoverMenu } from "@/components/MessageActions";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import { MessageActionSheet } from "@/components/MessageActionSheet";
import { makeLongPressHandlers } from "@/hooks/useLongPress";
import { parseMarkdown } from "@/lib/markdown";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useBlocking } from "@/hooks/useBlocking";
import { useCached, readCache, writeCache } from "@/lib/cache";
import { markServerSeen } from "@/hooks/useInbox";
import { VoiceRoom } from "@/components/VoiceRoom";
import { ProfileModalById } from "@/components/ProfileModalById";

export const Route = createFileRoute("/_authenticated/canais/$channelId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Canais — Concord" },
      {
        name: "description",
        content: "Converse em canais de texto do Concord com mensagens em tempo real.",
      },
      { property: "og:title", content: "Canais — Concord" },
      {
        property: "og:description",
        content: "Canais de texto do Concord com mensagens em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChannelPage,
});

type Server = { id: string; name: string; icon_url: string | null; owner_id: string };
type Channel = { id: string; name: string; server_id: string | null; kind?: string };
type Author = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status?: string | null;
  is_online?: boolean;
  last_active_at?: string;
};
type Message = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  is_pinned?: boolean;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  author: Author | null;
};

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
}

function ChannelPage() {
  const { channelId } = useParams({ from: "/_authenticated/canais/$channelId" });
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { selfMute, selfDeafen, toggleSelfMute, toggleSelfDeafen } = useCalls();
  // ---- Bloqueio (shadow ban efetivo apenas nas DMs; aqui filtramos a exibição) ----
  const { blocked, isBlocked } = useBlocking();
  const blockedIdsRef = useRef(blocked);
  useEffect(() => {
    blockedIdsRef.current = blocked;
  }, [blocked]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const sync = useRealtimeSync();

  const [servers, setServers] = useCached<Server[]>("servers", []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Author[]>([]);
  const [messages, setMessages, hadMessages] = useCached<Message[]>(`msgs:${channelId}`, []);
  const [loadingMessages, setLoadingMessages] = useState(!hadMessages);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
  } | null>(null);

  function handleMessageContextMenu(e: React.MouseEvent, messageId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId });
  }

  // Extrai apenas dia/mês/ano para comparar entre mensagens consecutivas.
  function dateKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  const [serverId, setServerId] = useState<string | null>(
    () => readCache<string>(`chan-server:${channelId}`) ?? null,
  );
  const endRef = useRef<HTMLDivElement>(null);

  const currentChannel = channels.find((c) => c.id === channelId);
  const currentServer = servers.find((s) => s.id === serverId);
  const isOwner = !!currentServer && currentServer.owner_id === user?.id;

  // Servidores do usuário
  const loadServers = useCallback(async () => {
    const { data } = await supabase
      .from("servers")
      .select("id, name, icon_url, owner_id")
      .order("created_at", { ascending: true });
    setServers((data as Server[]) ?? []);
  }, [setServers]);

  useEffect(() => {
    void loadServers();
  }, [loadServers, sync]);

  // Descobre o servidor do canal atual (usa cache para não travar a troca de tela)
  useEffect(() => {
    const cached = readCache<string>(`chan-server:${channelId}`);
    setServerId(cached ?? null);
    void (async () => {
      const { data } = await supabase
        .from("channels")
        .select("server_id")
        .eq("id", channelId)
        .maybeSingle();
      const id = data?.server_id ?? null;
      if (id) writeCache(`chan-server:${channelId}`, id);
      setServerId(id);
    })();
  }, [channelId]);

  // Canais e membros do servidor atual (em paralelo)
  useEffect(() => {
    if (serverId) markServerSeen(serverId);
  }, [serverId, channelId, messages.length]);

  useEffect(() => {
    if (!serverId) return;
    const cachedChans = readCache<Channel[]>(`channels:${serverId}`);
    if (cachedChans) setChannels(cachedChans);
    const cachedMems = readCache<Author[]>(`members:${serverId}`);
    if (cachedMems) setMembers(cachedMems);

    void (async () => {
      // Canais: tenta com a coluna "kind" (migrações novas); se ela não
      // existir no banco, refaz sem ela para nunca quebrar a listagem.
      let chansRes: { data: Channel[] | null; error: { message: string } | null } =
        await supabase
          .from("channels")
          .select("id, name, server_id, kind")
          .eq("server_id", serverId)
          .order("created_at", { ascending: true });
      if (chansRes.error) {
        const fb = await supabase
          .from("channels")
          .select("id, name, server_id")
          .eq("server_id", serverId)
          .order("created_at", { ascending: true });
        chansRes = fb;
      }
      const chans = (chansRes.data as Channel[]) ?? [];
      writeCache(`channels:${serverId}`, chans);
      setChannels(chans);

      const memsRes = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", serverId);
      const ids = (memsRes.data ?? []).map((m) => m.user_id as string);
      if (ids.length) {
        // Perfis: tenta com presença (is_online/last_active_at); se não
        // existirem no banco, refaz sem elas para os membros ainda aparecerem.
        const primary = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, status, is_online, last_active_at")
          .in("id", ids);
        const fallback = primary.error
          ? await supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url, status")
              .in("id", ids)
          : null;
        const list = ((fallback?.data as unknown as Author[]) ??
          (primary.data as unknown as Author[])) ?? [];
        writeCache(`members:${serverId}`, list);
        setMembers(list);
      } else {
        writeCache(`members:${serverId}`, []);
        setMembers([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, sync]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select(
        "id, content, created_at, user_id, attachment_url, attachment_name, attachment_type, attachment_size",
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (data ?? []).slice().reverse();
    const ids = [...new Set(rows.map((r) => r.user_id))];
    let byId = new Map<string, Author>();
    if (ids.length) {
      const cachedProfiles = ids
        .map((id) => readCache<Author>(`profile:${id}`))
        .filter((p): p is Author => !!p);
      if (cachedProfiles.length === ids.length) {
        byId = new Map(cachedProfiles.map((p) => [p.id, p]));
      } else {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", ids);
        const list = (profs as Author[]) ?? [];
        list.forEach((p) => writeCache(`profile:${p.id}`, p));
        byId = new Map(list.map((p) => [p.id, p]));
      }
    }
    setMessages(
      rows.map((r) => ({ ...(r as Omit<Message, "author">), author: byId.get(r.user_id) ?? null })),
    );
    setLoadingMessages(false);
  }, [channelId, setMessages]);

  useEffect(() => {
    setLoadingMessages(!readCache<Message[]>(`msgs:${channelId}`));
    void fetchMessages();
  }, [channelId, fetchMessages]);

  useEffect(() => {
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as Omit<Message, "author">;
          // Não renderiza novas mensagens de quem o usuário local bloqueou.
          if (blockedIdsRef.current.has(row.user_id)) return;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [...prev, { ...row, author: readCache<Author>(`profile:${row.user_id}`) ?? null }],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [channelId, setMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId]);

  async function openServer(id: string) {
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

  async function createChannel() {
    if (!serverId) return;
    const name = window.prompt("Nome do novo canal");
    if (!name?.trim()) return;
    const kind = window.confirm("Criar como canal de VOZ? (Cancelar = canal de texto)")
      ? "voice"
      : "text";
    const { data, error } = await supabase
      .from("channels")
      .insert({ name: name.trim().toLowerCase().replace(/\s+/g, "-"), server_id: serverId, kind })
      .select("id, name, server_id, kind")
      .single();
    if (error) setError(error.message);
    else {
      setChannels((prev) => [...prev, data as Channel]);
      navigate({ to: "/canais/$channelId", params: { channelId: data.id } });
    }
  }

  async function renameChannel(c: Channel) {
    const name = window.prompt("Novo nome do canal", c.name);
    if (!name?.trim()) return;
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
    const { error } = await supabase.from("channels").update({ name: clean }).eq("id", c.id);
    if (error) setError(error.message);
    else setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: clean } : x)));
  }

  async function deleteChannel(c: Channel) {
    if (!window.confirm(`Apagar o canal #${c.name}?`)) return;
    const { error } = await supabase.from("channels").delete().eq("id", c.id);
    if (error) {
      setError(error.message);
      return;
    }
    const rest = channels.filter((x) => x.id !== c.id);
    setChannels(rest);
    if (c.id === channelId) {
      if (rest[0]) navigate({ to: "/canais/$channelId", params: { channelId: rest[0].id } });
      else navigate({ to: "/canais" });
    }
  }

  async function handleSend({
    content,
    attachment,
  }: {
    content: string;
    attachment: { url: string; name: string; type: string; size: number } | null;
  }) {
    if (!user) return;
    setError(null);
    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      content,
      user_id: user.id,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
    });
    if (error) throw new Error(error.message);
    void fetchMessages();
  }

  async function handleTogglePin(messageId: string, isPinned: boolean) {
    // Cast necessário: coluna is_pinned ainda pode não estar nos types gerados.
    const { error } = await (
      supabase.from("messages") as unknown as {
        update: (o: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ is_pinned: !isPinned })
      .eq("id", messageId);
    if (!error) {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, is_pinned: !isPinned } : msg)),
      );
    }
  }

  async function handleDeleteMessage(messageId: string) {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (!error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    }
  }

  // Mensagens visíveis no canal: oculta localmente as de quem foi bloqueado.
  const visibleMessages = (messages ?? []).filter((m) => m && !isBlocked(m.user_id));

  // Early return DEPOIS de todos os hooks (ordem estável): nada abaixo monta
  // a árvore do chat até os dados essenciais existirem — elimina o "flash crash".
    if (loadingMessages || !currentChannel || !channelId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-servers px-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </p>
      </main>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <SwipeEdgeOpener onOpen={() => setDrawerOpen(true)} />
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
      <ServerRail activeServerId={serverId} />

      {/* Canais */}
      <aside className="flex w-[16rem] max-w-[calc(85vw-60px)] shrink-0 flex-col border-r border-border/60 bg-channels md:w-60 md:max-w-none">
        <header className="flex h-14 items-center justify-between border-b border-border/60 px-4">
          <span className="truncate text-[15px] font-semibold tracking-tight">
            {currentServer?.name ?? "Concord"}
          </span>
          <div className="flex items-center gap-1">
            {isOwner && (
              <button
                onClick={() => setServerSettingsOpen(true)}
                aria-label="Configurações do servidor"
                title="Configurações do servidor"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Cog className="size-4" />
              </button>
            )}
            <button
              onClick={() => setInviteOpen(true)}
              aria-label="Convidar pessoas"
              title="Convidar pessoas"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <UserPlus className="size-4" />
            </button>
          </div>
        </header>
        {currentServer?.icon_url && (
          <div className="h-24 w-full overflow-hidden border-b border-border/60">
            <ServerMedia
              url={currentServer.icon_url}
              alt={`Mídia do servidor ${currentServer.name}`}
              className="size-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Canais
            </p>
            {isOwner && (
              <button
                onClick={() => void createChannel()}
                aria-label="Criar canal"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {channels.map((c, i) => (
              <li key={c.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-up group/item relative">
                <button
                  onClick={() => navigate({ to: "/canais/$channelId", params: { channelId: c.id } })}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    c.id === channelId
                      ? "bg-accent text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  {c.kind === "voice" ? (
                    <Volume2
                      className={`size-4 shrink-0 transition-colors ${c.id === channelId ? "text-primary" : ""}`}
                    />
                  ) : (
                    <Hash
                      className={`size-4 shrink-0 transition-colors ${c.id === channelId ? "text-primary" : ""}`}
                    />
                  )}
                  <span className="truncate tracking-tight">{c.name}</span>
                </button>
                {isOwner && (
                  <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover/item:flex">
                    <button
                      onClick={() => void renameChannel(c)}
                      aria-label={`Editar canal ${c.name}`}
                      title="Editar nome"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => void deleteChannel(c)}
                      aria-label={`Apagar canal ${c.name}`}
                      title="Apagar canal"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Painel do usuário local — barra flutuante estilo composer.
            Sempre fixo no rodapé da sidebar esquerda (igual à pestaña Amigos). */}
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
      </aside>
      </SideDrawer>

      {/* Chat */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-[64px] xl:pb-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/[0.06] to-transparent"
        />
        <header className="surface-glass relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-6">
          <MenuButton onClick={() => setDrawerOpen(true)} />
          {currentChannel?.kind === "voice" ? (
            <Volume2 className="size-5 text-muted-foreground" />
          ) : (
            <Hash className="size-5 text-muted-foreground" />
          )}
          <h1 className="text-balance-tight text-[15px] font-semibold">
            {currentChannel?.name ?? "canal"}
          </h1>
          <button
            onClick={() => setInviteOpen(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/25"
          >
            <UserPlus className="size-4" /> Convidar
          </button>
          <button
            onClick={() => setMembersOpen(true)}
            aria-label="Ver membros"
            title="Membros"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground xl:hidden"
          >
            <Users className="size-5" />
          </button>
        </header>

        {currentChannel?.kind === "voice" ? (
          <VoiceRoom
            channelId={channelId}
            channelName={currentChannel.name}
            displayName={profile?.display_name || profile?.username || "Usuário"}
            avatarUrl={profile?.avatar_url ?? null}
            onLeave={() => {
              const text = channels.find((c) => c.kind !== "voice");
              if (text) navigate({ to: "/canais/$channelId", params: { channelId: text.id } });
            }}
          />
        ) : (
          <>
        <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
          {loadingMessages ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando mensagens…
            </div>
          ) : visibleMessages.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Nenhuma mensagem ainda. Comece a conversa em #{currentChannel?.name ?? ""}.
            </p>
          ) : (
            visibleMessages.map((m, i) => {
              const showSeparator = i === 0 || dateKey(m.created_at) !== dateKey(visibleMessages[i - 1]!.created_at);
              return (
                <Fragment key={m.id}>
                  {showSeparator && <DateSeparator date={m.created_at} />}
                  <article
                    key={m.id}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    onContextMenu={(e) => handleMessageContextMenu(e, m.id)}
                    {...makeLongPressHandlers(() => setActionMessageId(m.id))}
                    className="animate-fade-up group -mx-2 flex gap-3 rounded-xl px-2 py-1 transition-colors duration-200 hover:bg-accent/25 active:bg-accent/40"
                  >
                    <button
                      type="button"
                      onClick={() => m.author?.id && setProfileUserId(m.author.id)}
                      aria-label={`Abrir perfil de ${m.author?.display_name ?? m.author?.username ?? "usuário"}`}
                      className="shrink-0 rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
                    >
                      <UserAvatar
                        username={m.author?.username ?? "?"}
                        avatarUrl={m.author?.avatar_url ?? null}
                        className="size-10 shrink-0 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.8)] user-select-none"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 user-select-none">
                        {m.author?.id && (
                          <button
                            type="button"
                            onClick={() => m.author?.id && setProfileUserId(m.author.id)}
                            className="truncate text-sm font-semibold tracking-tight text-[#dbdee1] transition-colors hover:text-[#b5bac1] hover:underline"
                          >
                            {m.author?.display_name || m.author?.username || "Usuário"}
                          </button>
                        )}
                        {!m.author?.id && (
                          <span className="text-sm font-semibold tracking-tight text-[#dbdee1]">
                            {m.author?.display_name || m.author?.username || "Usuário"}
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-[#949ba4]">
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </p>
                      {m.content && (
                        <div className="break-words text-[15px] leading-[1.6] text-[#dbdee1] user-select-text">
                          {parseMarkdown(m.content)}
                        </div>
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
                    <MessageHoverMenu
                      isOwn={m.user_id === user?.id}
                      isPinned={Boolean(m.is_pinned)}
                      onPin={() => handleTogglePin(m.id, !!m.is_pinned)}
                      onDelete={() => handleDeleteMessage(m.id)}
                      onReply={() => {}}
                      onReact={() => {}}
                      onCopyLink={() => {
                        const link = `${window.location.origin}/canais/${channelId}?msg=${m.id}`;
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

        {error && <p className="px-6 text-sm text-destructive">{error}</p>}
        <ChatInput
          placeholder={`Conversar em #${currentChannel?.name ?? ""}`}
          onSend={handleSend}
        />
          </>
        )}
      </main>

      {/* Membros */}
      <aside className="hidden w-60 shrink-0 flex-col border-l border-border/60 bg-channels p-4 xl:flex">
        <p className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Membros — {members.length}
        </p>
        <ul className="space-y-1">
          {members.map((m, i) => (
            <li
              key={m.id}
              style={{ animationDelay: `${i * 50}ms` }}
              className="animate-fade-up group"
            >
              <button
                type="button"
                onClick={() => setProfileUserId(m.id)}
                aria-label={`Ver perfil de ${m.display_name || m.username}`}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-accent/50"
              >
                <div className="relative shrink-0">
                  <UserAvatar username={m.username} avatarUrl={m.avatar_url} />
                  <SmartStatusDot
                    status={m.status}
                    isOnline={m.is_online}
                    lastActiveAt={m.last_active_at}
                    ring="border-channels"
                  />
                </div>
                <span className="min-w-0 truncate text-sm tracking-tight text-muted-foreground transition-colors group-hover:text-foreground">
                  {m.display_name || m.username}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Gaveta direita de membros (mobile) */}
      <RightDrawer open={membersOpen} onClose={() => setMembersOpen(false)}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <span className="text-[15px] font-semibold tracking-tight">
            Membros — {members.length}
          </span>
          <button
            onClick={() => setMembersOpen(false)}
            aria-label="Fechar membros"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-4">
          {members.map((m, i) => (
            <li
              key={m.id}
              style={{ animationDelay: `${i * 50}ms` }}
              className="animate-fade-up group"
            >
              <button
                type="button"
                onClick={() => {
                  setMembersOpen(false);
                  setProfileUserId(m.id);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors active:bg-accent/50"
              >
                <div className="relative shrink-0">
                  <UserAvatar username={m.username} avatarUrl={m.avatar_url} />
                  <SmartStatusDot
                    status={m.status}
                    isOnline={m.is_online}
                    lastActiveAt={m.last_active_at}
                    ring="border-channels"
                  />
                </div>
                <span className="min-w-0 truncate text-sm tracking-tight text-[#dbdee1]">
                  {m.display_name || m.username}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </RightDrawer>

      {profileUserId && (
        <ProfileModalById userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}

      {settingsOpen && <UserSettingsModal onClose={() => setSettingsOpen(false)} />}
      {serverSettingsOpen && currentServer && (
        <ServerSettingsModal
          server={currentServer}
          onClose={() => setServerSettingsOpen(false)}
          onChanged={() => void loadServers()}
          onDeleted={() => {
            setServerSettingsOpen(false);
            void loadServers();
            navigate({ to: "/canais" });
          }}
        />
      )}
      {inviteOpen && serverId && (
        <InviteModal serverId={serverId} onClose={() => setInviteOpen(false)} />
      )}

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwn={messages.find((m) => m.id === contextMenu.messageId)?.user_id === user?.id}
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
            if (msg) void handleTogglePin(msg.id, !!msg.is_pinned);
          }}
          onMarkUnread={() => {}}
          onCopyLink={() => {
            const link = typeof window !== "undefined" ? `${window.location.origin}/canais/${channelId}?msg=${contextMenu.messageId}` : `/canais/${channelId}?msg=${contextMenu.messageId}`;
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
            messages.find((m) => m.id === contextMenu.messageId)?.user_id === user?.id
              ? () => {
                  const msg = messages.find((m) => m.id === contextMenu.messageId);
                  if (msg) void handleDeleteMessage(msg.id);
                }
              : undefined
          }
        />
      )}

      {/* Bottom sheet de ações (long press) — mobile */}
      {actionMessageId && (
        <MessageActionSheet
          open
          onClose={() => setActionMessageId(null)}
          isOwn={messages.find((m) => m.id === actionMessageId)?.user_id === user?.id}
          onReact={() => {}}
          onReply={() => {}}
          onForward={() => {}}
          onCopyText={() => {
            const msg = messages.find((m) => m.id === actionMessageId);
            if (msg?.content) void navigator.clipboard.writeText(msg.content);
          }}
          onPin={() => {
            const msg = messages.find((m) => m.id === actionMessageId);
            if (msg) void handleTogglePin(msg.id, !!msg.is_pinned);
          }}
          onMarkUnread={() => {}}
          onCopyLink={() => {
            const link = typeof window !== "undefined" ? `${window.location.origin}/canais/${channelId}?msg=${actionMessageId}` : `/canais/${channelId}?msg=${actionMessageId}`;
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
            messages.find((m) => m.id === actionMessageId)?.user_id === user?.id
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
    </div>
  );
}
