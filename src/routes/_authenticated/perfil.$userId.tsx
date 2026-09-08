import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { UserAvatar } from "@/components/UserAvatar";
import { SmartStatusDot } from "@/components/StatusDot";
import { ServerRail } from "@/components/ServerRail";
import { DirectSidebar } from "@/components/DirectSidebar";
import { SideDrawer, MenuButton } from "@/components/MobileShell";

export const Route = createFileRoute("/_authenticated/perfil/$userId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Perfil — Concord" }] }),
  component: ProfilePage,
});

async function loadProfile(userId: string): Promise<Profile | null> {
  // Tenta com as colunas novas (bio, banner, presença). Se elas ainda não
  // existirem no banco (migração pendente), refaz sem elas para nunca quebrar.
  const primary = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, banner_url, banner_color, bio, status, is_online, last_active_at, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!primary.error) return (primary.data as unknown as Profile) ?? null;
  const fallback = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, status, created_at")
    .eq("id", userId)
    .maybeSingle();
  return (fallback.data as unknown as Profile) ?? null;
}
function ProfilePage() {
  const { userId } = useParams({ from: "/_authenticated/perfil/$userId" });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reload } = useFriends();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadProfile(userId)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!user || !userId) return;
    void (async () => {
      const { data, error } = await supabase.rpc("are_friends", { _a: user.id, _b: userId });
      if (!error && typeof data === "boolean") {
        setIsFriend(data);
        return;
      }
      const { data: fr } = await supabase
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();
      setIsFriend(Boolean(fr));
    })();
  }, [user, userId]);

  async function handleSendRequest() {
    if (!user || !profile || user.id === profile.id) return;
    setSending(true);
    setFeedback(null);
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: profile.id, status: "pending" });
    if (error) setFeedback(error.message);
    else {
      setFeedback("Pedido de amizade enviado!");
      await reload();
    }
    setSending(false);
  }

  const isSelf = user?.id === userId;
  const name = profile?.display_name || profile?.username || "Usuário";
return (
    <div className="flex h-screen">
      <ServerRail />
      <div className="hidden h-full lg:block">
        <DirectSidebar />
      </div>

      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <DirectSidebar />
      </SideDrawer>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <MenuButton onClick={() => setDrawerOpen(true)} />
          <button
            onClick={() => navigate({ to: "/amigos" })}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </button>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Perfil</h1>
        </header>

        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && !profile && (
            <div className="rounded-xl border border-border bg-channels p-10 text-center">
              <p className="text-sm text-muted-foreground">Usuário não encontrado.</p>
              <button
                onClick={() => navigate({ to: "/amigos" })}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <ArrowLeft className="size-4" /> Voltar para Amigos
              </button>
            </div>
          )}

          {!loading && profile && (
            <div
              key={profile.id}
              className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-channels shadow-[0_16px_48px_-16px_rgba(0,0,0,0.7)]"
            >
              {/* Banner */}
              <div
                className="relative h-36 w-full bg-[#313338]"
                style={
                  profile.banner_url
                    ? {
                        backgroundImage: `url(${profile.banner_url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { backgroundColor: profile.banner_color || "#11a0f4" }
                }
              />

              {/* Avatar + ações */}
              <div className="relative px-6 pb-6">
                <div className="mb-3 flex items-end justify-between">
                  <div className="relative -mt-14">
                    <UserAvatar
                      username={profile.username ?? "?"}
                      avatarUrl={profile.avatar_url ?? null}
                      className="size-28 text-3xl shadow-lg border-[6px] border-channels"
                    />
                    <SmartStatusDot
                      status={profile.status}
                      isOnline={profile.is_online}
                      lastActiveAt={profile.last_active_at}
                      ring="border-channels"
                      className="absolute bottom-2 right-2 size-6 border-4"
                    />
                  </div>
                  {!isSelf && (
                    <div className="flex items-center gap-2">
                      {isFriend && (
                        <button
                          onClick={() => navigate({ to: "/dm/$userId", params: { userId } })}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          <MessageSquare className="size-4" /> Mensagem
                        </button>
                      )}
                      {isFriend === false && (
                        <button
                          onClick={handleSendRequest}
                          disabled={sending}
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          <UserPlus className="size-4" /> {sending ? "Enviando..." : "Adicionar amigo"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
<h2 className="text-2xl font-bold tracking-tight text-foreground">{name}</h2>
                {profile.username && (
                  <p className="mt-0.5 text-sm text-muted-foreground">@{profile.username}</p>
                )}

                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {profile.is_online
                      ? "Online"
                      : profile.status === "ausente"
                        ? "Ausente"
                        : profile.status === "ocupado"
                          ? "Ocupado"
                          : profile.status === "invisível"
                            ? "Invisível"
                            : "Offline"}
                  </span>
                </div>

                {feedback && (
                  <p className="mt-3 rounded-lg bg-accent/40 px-3 py-2 text-sm text-foreground">
                    {feedback}
                  </p>
                )}

                <div className="mt-5 border-t border-border/60 pt-5">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Bio
                  </h3>
                  {profile.bio ? (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
                      {profile.bio}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Nenhuma descrição.</p>
                  )}
                </div>

                <div className="mt-5 border-t border-border/60 pt-5">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Membro desde
                  </h3>
                  <p className="text-sm text-foreground/80">
                    {profile.created_at
                      ? new Date(profile.created_at).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}