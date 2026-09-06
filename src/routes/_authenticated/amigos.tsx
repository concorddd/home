import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2, X, MessageSquare, Users, MoreHorizontal, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { ServerRail } from "@/components/ServerRail";
import { DirectSidebar } from "@/components/DirectSidebar";
import { SideDrawer, MenuButton, MobileTabBar } from "@/components/MobileShell";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot } from "@/components/StatusDot";

export const Route = createFileRoute("/_authenticated/amigos")({
  head: () => ({ meta: [{ title: "Amigos — Concord" }] }),
  component: FriendsPage,
});

type Tab = "todos" | "pendentes" | "adicionar";

function FriendsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { friends, incoming, outgoing, reload } = useFriends();
  const [tab, setTab] = useState<Tab>("todos");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const username = query.trim().replace(/^@/, "");
    if (!username) return;
    setBusy(true);
    setFeedback(null);
    try {
      // Busca exata primeiro (ilike com _ quebra usernames); fallback parcial.
      let target: { id: string; username: string } | null = null;
      const exact = await supabase.from("profiles").select("id, username").eq("username", username).maybeSingle();
      if (exact.data) {
        target = exact.data as unknown as { id: string; username: string };
      } else {
        const partial = await supabase.from("profiles").select("id, username").ilike("username", username).limit(2);
                const rows = (partial.data as unknown as Array<{ id: string; username: string }>) ?? [];
        const first = rows.length === 1 ? (rows[0] ?? null) : null;
        target = first;
      }
      if (!target) throw new Error("Usuário não encontrado.");
      if (target.id === user.id) throw new Error("Você não pode adicionar a si mesmo.");
      const existing = [...friends, ...incoming, ...outgoing].find((f) => f.profile?.id === target.id);
      if (existing) throw new Error("Já existe um pedido ou amizade.");
      const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: target.id, status: "pending" });
      if (error) throw error;
      setFeedback({ kind: "ok", text: `Pedido enviado para @${target.username}.` });
      setQuery("");
      await reload();
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Erro ao enviar pedido." });
    } finally {
      setBusy(false);
    }
  }

  async function respond(id: string, status: "accepted" | "declined") {
    await supabase.from("friendships").update({ status }).eq("id", id);
    await reload();
  }

  async function removeFriend(id: string) {
    await supabase.from("friendships").delete().eq("id", id);
    await reload();
  }

  const tabs = [
    { id: "todos" as const, label: "Todos" },
    { id: "pendentes" as const, label: "Pendentes" },
    { id: "adicionar" as const, label: "Adicionar Amigo" },
  ];

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-[#1a1b1e]">
        <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <ServerRail homeActive />
        </SideDrawer>
        <DirectSidebar activeUserId={null} />
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-4 border-b border-[#141517] px-6 py-3">
            <MenuButton onClick={() => setDrawerOpen(true)} />
            <Users className="size-5 text-[#f9a620]" />
            <span className="font-semibold text-[#c7c8cc]">Amigos</span>
            <div className="h-6 w-px bg-[#242629]" />
            <div className="flex items-center gap-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-[#282a2e] text-[#c7c8cc]" : "text-[#808287] hover:bg-[#282a2e] hover:text-[#c7c8cc]"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={() => setTab("adicionar")} className="ml-auto rounded-md bg-[#f9a620] px-4 py-1.5 text-sm font-medium text-[#1a1b1e] hover:bg-[#e2941a] transition-colors">
              Adicionar Amigo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "adicionar" ? (
              <div className="max-w-2xl">
                <h2 className="mb-2 text-xs font-semibold uppercase text-[#808287]">Adicionar amigo</h2>
                <p className="mb-4 text-sm text-[#808287]">Você pode adicionar amigos pelo nome de usuário deles.</p>
                <form onSubmit={sendRequest} className="relative">
                  <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite o @username" className="w-full rounded-lg bg-[#141517] px-4 py-3 pr-32 text-sm text-[#c7c8cc] placeholder-[#808287] focus:outline-none focus:ring-2 focus:ring-[#f9a620]" />
                  <button type="submit" disabled={busy || !query.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-[#f9a620] px-4 py-1.5 text-sm font-medium text-[#1a1b1e] hover:bg-[#e2941a] disabled:opacity-50 transition-colors">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Enviar Pedido"}
                  </button>
                </form>
                {feedback && <p className={`mt-3 text-sm ${feedback.kind === "ok" ? "text-green-400" : "text-red-400"}`}>{feedback.text}</p>}
              </div>
            ) : tab === "pendentes" ? (
              <PendentesTab incoming={incoming} outgoing={outgoing} onRespond={respond} onRemove={removeFriend} />
            ) : (
              <TodosTab friends={friends} navigate={navigate} onAskRemove={setRemoveTarget} />
            )}
          </div>
        </main>
        <MobileTabBar active="home" onServers={() => setDrawerOpen(true)} onProfile={() => setProfileOpen(true)} />
      </div>
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-[#242629] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#c7c8cc]">Remover "{removeTarget.name}"?</h3>
            <p className="mt-2 text-sm text-[#808287]">Vocês deixarão de ser amigos. Vocês ainda poderão enviar novos pedidos de amizade no futuro.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setRemoveTarget(null)} className="rounded-md px-4 py-2 text-sm text-[#c7c8cc] hover:underline">Cancelar</button>
              <button
                onClick={async () => {
                  await removeFriend(removeTarget.id);
                  setRemoveTarget(null);
                }}
                className="rounded-md bg-[#da373c] px-4 py-2 text-sm font-medium text-white hover:bg-[#a12828]"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
      {profileOpen && <UserSettingsModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}

type FriendProfile = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  status?: string;
  is_online?: boolean;
  last_active_at?: string;
};

function PendentesTab({ incoming, outgoing, onRespond, onRemove }: {
  incoming: Array<{ id: string; profile: FriendProfile | null }>;
  outgoing: Array<{ id: string; profile: FriendProfile | null }>;
  onRespond: (id: string, status: "accepted" | "declined") => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-4 text-xs font-semibold uppercase text-[#808287]">
        Pendentes — {incoming.length + outgoing.length}
      </h2>
      <ul className="space-y-0.5">
        {incoming.length === 0 && outgoing.length === 0 && (
          <li className="py-8 text-center text-sm text-[#808287]">Não há pedidos pendentes.</li>
        )}
        {incoming.map((f) => (
          <li key={f.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#242629]">
            <div className="relative shrink-0">
              <UserAvatar username={f.profile?.username ?? "?"} avatarUrl={f.profile?.avatar_url ?? null} className="size-10 text-base" />
              <SmartStatusDot status={f.profile?.status} isOnline={f.profile?.is_online} lastActiveAt={f.profile?.last_active_at} ring="border-[#1a1b1e]" className="size-3.5 border-2" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#c7c8cc] truncate">
                {f.profile?.display_name || f.profile?.username}
                <span className="ml-1 text-xs font-normal text-[#808287]">@{f.profile?.username}</span>
              </p>
              <p className="text-xs text-[#808287]">Pedido de amizade recebido</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onRespond(f.id, "accepted")} className="rounded-full bg-[#f9a620] p-2 text-[#1a1b1e] hover:bg-[#e2941a]" title="Aceitar">
                <Check className="size-4" />
              </button>
              <button onClick={() => onRespond(f.id, "declined")} className="rounded-full bg-[#282a2e] p-2 text-[#c7c8cc] hover:bg-[#3a3d42]" title="Recusar">
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {outgoing.map((f) => (
          <li key={f.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#242629]">
            <div className="relative shrink-0">
              <UserAvatar username={f.profile?.username ?? "?"} avatarUrl={f.profile?.avatar_url ?? null} className="size-10 text-base" />
              <SmartStatusDot status={f.profile?.status} isOnline={f.profile?.is_online} lastActiveAt={f.profile?.last_active_at} ring="border-[#1a1b1e]" className="size-3.5 border-2" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#c7c8cc] truncate">
                {f.profile?.display_name || f.profile?.username}
                <span className="ml-1 text-xs font-normal text-[#808287]">@{f.profile?.username}</span>
              </p>
              <p className="text-xs text-[#808287]">Pedido de amizade enviado</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onRemove(f.id)} className="rounded-full bg-[#282a2e] p-2 text-[#c7c8cc] hover:bg-[#3a3d42]" title="Cancelar">
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodosTab({ friends, navigate, onAskRemove }: {
  friends: Array<{ id: string; profile: FriendProfile | null }>;
  navigate: (opts: { to: string; params: { userId: string } }) => void;
  onAskRemove: (f: { id: string; name: string }) => void;
}) {
  return (
    <div>
      <h2 className="mb-4 text-xs font-semibold uppercase text-muted-foreground">Todos os amigos — {friends.length}</h2>
      {friends.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-[#808287]">Nenhum amigo ainda. Adicione alguém para começar!</p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {friends.map((f) => (
            <li
              key={f.id}
              onClick={() =>
                f.profile && navigate({ to: "/perfil/$userId", params: { userId: f.profile.id } })
              }
              className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#242629]"
            >
              <div className="relative shrink-0">
                <UserAvatar username={f.profile?.username ?? "?"} avatarUrl={f.profile?.avatar_url ?? null} className="size-10 text-base" />
                <SmartStatusDot status={f.profile?.status} isOnline={f.profile?.is_online} lastActiveAt={f.profile?.last_active_at} ring="border-[#1a1b1e]" className="size-3.5 border-2" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#c7c8cc] truncate">
                  {f.profile?.display_name || f.profile?.username}
                  <span className="ml-1 text-xs font-normal text-[#808287]">@{f.profile?.username}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.profile?.status === "online" && "Online"}
                  {f.profile?.status === "ausente" && "Ausente"}
                  {f.profile?.status === "ocupado" && "Ocupado"}
                  {f.profile?.status === "invisível" && "Invisível"}
                  {!f.profile?.status && "Offline"}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (f.profile) navigate({ to: "/perfil/$userId", params: { userId: f.profile.id } });
                  }}
                  className="rounded-full bg-[#282a2e] p-2 text-[#f9a620] hover:bg-[#282a2e] hover:text-[#f9a620]"
                  title="Ver perfil"
                >
                  <UserRound className="size-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); f.profile && navigate({ to: "/dm/$userId", params: { userId: f.profile.id } }); }} className="rounded-full bg-[#282a2e] p-2 text-[#f9a620] hover:bg-[#282a2e] hover:text-[#f9a620]" title="Mensagem">
                  <MessageSquare className="size-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onAskRemove({ id: f.id, name: f.profile?.display_name || f.profile?.username || "?" }); }} className="rounded-full bg-[#282a2e] p-2 text-[#f9a620] hover:bg-[#282a2e] hover:text-[#f9a620]" title="Remover">
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
