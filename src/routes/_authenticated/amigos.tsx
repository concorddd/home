import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2, Search, UserPlus, X, MessageSquare, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { ServerRail } from "@/components/ServerRail";
import { DirectSidebar } from "@/components/DirectSidebar";
import { SideDrawer, MenuButton, MobileTabBar } from "@/components/MobileShell";
import { UserSettingsModal } from "@/components/UserSettingsModal";
import { UserAvatar } from "@/components/UserAvatar";
import { StatusDot } from "@/components/StatusDot";

export const Route = createFileRoute("/_authenticated/amigos")({
  head: () => ({
    meta: [
      { title: "Amigos — Concord" },
      {
        name: "description",
        content:
          "Gerencie amizades no Concord: envie pedidos por @username, aceite convites e abra conversas privadas.",
      },
      { property: "og:title", content: "Amigos — Concord" },
      {
        property: "og:description",
        content: "Envie pedidos de amizade por @username e converse em mensagens diretas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FriendsPage,
});

type Tab = "todos" | "pendentes" | "adicionar";

function FriendsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { friends, incoming, outgoing, loading, reload } = useFriends();
  const [tab, setTab] = useState<Tab>("todos");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const username = query.trim().replace(/^@/, "");
    if (!username) return;
    setBusy(true);
    setFeedback(null);
    try {
      const { data: target } = await supabase
        .from("profiles")
        .select("id, username")
        .ilike("username", username)
        .maybeSingle();
      if (!target) throw new Error("Nenhum usuário encontrado com esse @username.");
      if (target.id === user.id) throw new Error("Você não pode adicionar a si mesmo.");

      const existing = [...friends, ...incoming, ...outgoing].find(
        (f) => f.profile?.id === target.id,
      );
      if (existing) throw new Error("Já existe um pedido ou amizade com esse usuário.");

      const { error } = await supabase
        .from("friendships")
        .insert({ requester_id: user.id, addressee_id: target.id, status: "pending" });
      if (error) throw error;
      setFeedback({ kind: "ok", text: `Pedido enviado para @${target.username}.` });
      setQuery("");
      await reload();
    } catch (err) {
      setFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : "Não foi possível enviar o pedido.",
      });
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

  return (
    <>
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ServerRail homeActive />
        <DirectSidebar />
      </SideDrawer>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="surface-glass relative z-10 flex h-14 items-center gap-2 border-b border-border/60 px-3 md:gap-4 md:px-6">
          <MenuButton onClick={() => setDrawerOpen(true)} />
          <h1 className="text-balance-tight text-[15px] font-semibold">Amigos</h1>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {(
              [
                ["todos", `Todos — ${friends.length}`],
                ["pendentes", `Pendentes — ${incoming.length + outgoing.length}`],
                ["adicionar", "Adicionar amigo"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === key
                    ? key === "adicionar"
                      ? "bg-[#3ba55d] text-white"
                      : "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </p>
          ) : tab === "adicionar" ? (
            <div className="max-w-xl animate-fade-up">
              <div className="rounded-2xl bg-channels p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                    <UserPlus className="size-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Adicionar amigo</h2>
                    <p className="text-sm text-muted-foreground">
                      Encontre pessoas pelo @username exato.
                    </p>
                  </div>
                </div>
                <form onSubmit={sendRequest} className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Digite o @username do amigo"
                      className="w-full rounded-xl bg-message-input py-3.5 pl-11 pr-4 text-sm outline-none ring-2 ring-transparent transition-all focus:ring-primary/50 placeholder:text-muted-foreground"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !query.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                    Enviar pedido de amizade
                  </button>
                </form>
                {feedback && (
                  <div
                    className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
                      feedback.kind === "ok"
                        ? "bg-[#3ba55d]/10 text-[#3ba55d]"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {feedback.kind === "ok" ? (
                      <Check className="size-4" />
                    ) : (
                      <X className="size-4" />
                    )}
                    {feedback.text}
                  </div>
                )}
              </div>
            </div>
          ) : tab === "pendentes" ? (
            <div className="max-w-2xl space-y-6">
              <section>
                <p className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Recebidos — {incoming.length}
                </p>
                {incoming.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum pedido recebido.</p>
                )}
                <ul className="space-y-1">
                  {incoming.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40"
                    >
                      <UserAvatar
                        username={f.profile?.username ?? "?"}
                        avatarUrl={f.profile?.avatar_url ?? null}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {f.profile?.display_name || f.profile?.username}{" "}
                        <span className="text-muted-foreground">@{f.profile?.username}</span>
                      </span>
                      <button
                        onClick={() => void respond(f.id, "accepted")}
                        aria-label="Aceitar"
                        title="Aceitar"
                        className="rounded-full bg-accent p-2 text-[#3ba55d] transition-colors hover:bg-[#3ba55d] hover:text-white"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => void respond(f.id, "declined")}
                        aria-label="Recusar"
                        title="Recusar"
                        className="rounded-full bg-accent p-2 text-destructive transition-colors hover:bg-destructive hover:text-white"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <p className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Enviados — {outgoing.length}
                </p>
                {outgoing.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum pedido enviado.</p>
                )}
                <ul className="space-y-1">
                  {outgoing.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40"
                    >
                      <UserAvatar
                        username={f.profile?.username ?? "?"}
                        avatarUrl={f.profile?.avatar_url ?? null}
                        className="size-11 text-base"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {f.profile?.display_name || f.profile?.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          @{f.profile?.username} — aguardando resposta
                        </p>
                      </div>
                      <button
                        onClick={() => void removeFriend(f.id)}
                        className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Cancelar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <div className="max-w-2xl">
              {friends.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Você ainda não tem amigos. Use a aba “Adicionar amigo” e busque por @username.
                </p>
              ) : (
                <ul className="space-y-1">
                  {friends.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40"
                    >
                      <div className="relative">
                        <UserAvatar
                          username={f.profile?.username ?? "?"}
                          avatarUrl={f.profile?.avatar_url ?? null}
                          className="size-11 text-base"
                        />
                        <StatusDot
                          status={f.profile?.status}
                          ring="border-channels"
                        />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {f.profile?.display_name || f.profile?.username}{" "}
                        <span className="text-muted-foreground">@{f.profile?.username}</span>
                      </span>
                      <button
                        onClick={() =>
                          f.profile &&
                          navigate({ to: "/dm/$userId", params: { userId: f.profile.id } })
                        }
                        className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
                      >
                        Mensagem
                      </button>
                      <button
                        onClick={() => void removeFriend(f.id)}
                        className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
      <MobileTabBar
        active="home"
        onServers={() => setDrawerOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />
    </div>
    {profileOpen && <UserSettingsModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}