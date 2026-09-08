// Modal flutuante de perfil completo (Dialog) — abre pelo "Ver Perfil Completo".
// Overlay escurecido com blur; container ~800px / mín. 500px em duas colunas:
//   • Esquerda (40%, #232428): banner dinâmico, avatar 120px, ações e seções.
//   • Direita (60%, #313338): abas ("Atividade" ativa) + card de atividade mockado.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Gamepad2, Loader2, MessageSquare, MoreHorizontal, UserCheck, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { useBlocking } from "@/hooks/useBlocking";

type Tab = "atividade" | "amigos" | "servidores";
/** Relação de amizade entre o usuário local e o dono do perfil aberto. */
type FriendRel = "loading" | "none" | "pending" | "friends";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "atividade", label: "Atividade" },
  { id: "amigos", label: "Sem Amigos em Comum" },
  { id: "servidores", label: "Sem Servidores em Comum" },
];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function ProfileModal({
  profile,
  onClose,
  onFriendStateChange,
}: {
  profile: Profile;
  onClose: () => void;
  /** Chamado quando a relação de amizade muda (para a tela de origem reagir). */
  onFriendStateChange?: (rel: "none" | "pending" | "friends") => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isBlocked, blockUser, unblockUser } = useBlocking();
  const [tab, setTab] = useState<Tab>("atividade");
  const [friendsSince, setFriendsSince] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rel, setRel] = useState<FriendRel>("loading");
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const name = profile.display_name || profile.username || "Usuário";
  const isSelf = profile.id === user?.id;
  const blockedSelf = isBlocked(profile.id);

  // Fecha com a tecla Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Nota local (por usuário, no localStorage) — não há coluna de nota no banco.
  useEffect(() => {
    try {
      setNote(localStorage.getItem(`concord:note:${profile.id}`) ?? "");
    } catch {
      // storage indisponível (modo privado): apenas ignora
    }
  }, [profile.id]);

  function handleNoteChange(value: string) {
    setNote(value);
    try {
      localStorage.setItem(`concord:note:${profile.id}`, value);
    } catch {
      // storage indisponível
    }
  }

  // "Amigos desde": data de criação da amizade aceita entre os dois usuários.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("created_at")
        .eq("status", "accepted")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`,
        )
        .limit(1)
        .maybeSingle();
      if (alive) setFriendsSince((data as { created_at: string } | null)?.created_at ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [user, profile.id]);

  function goToDm() {
    onClose();
    navigate({ to: "/dm/$userId", params: { userId: profile.id } });
  }

  // ---- Amizade: carrega o estado atual (aceita ou pendente) ----
  useEffect(() => {
    if (!user || isSelf) {
      setRel("none");
      return;
    }
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`,
        )
        .in("status", ["accepted", "pending"])
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const st = (data as { status: string } | null)?.status;
      setRel(st === "accepted" ? "friends" : st === "pending" ? "pending" : "none");
    })();
    return () => {
      alive = false;
    };
  }, [user, profile.id, isSelf]);

  function applyRel(next: FriendRel) {
    setRel(next);
    if (next !== "loading") onFriendStateChange?.(next);
  }

  async function handleAddFriend() {
    if (!user) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: profile.id, status: "pending" });
    if (error) {
      // O pedido pode já existir: relê o estado real do banco.
      const { data } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`,
        )
        .limit(1)
        .maybeSingle();
      const st = (data as { status: string } | null)?.status;
      applyRel(st === "accepted" ? "friends" : st === "pending" ? "pending" : "none");
      setBusy(false);
      return;
    }
    applyRel("pending");
    setFeedback(`Pedido de amizade enviado para ${name}.`);
    setBusy(false);
  }

  async function handleRemoveFriend() {
    if (!user) return;
    setBusy(true);
    setFeedback(null);
    // Remove apenas a relação de amizade no banco. Nunca apaga nem oculta o
    // histórico de mensagens entre os dois usuários.
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`,
      );
    setBusy(false);
    if (error) {
      setFeedback(error.message);
      return;
    }
    applyRel("none");
    setFeedback(`Amizade com ${name} desfeita. O histórico de mensagens foi mantido.`);
  }

  async function handleToggleBlock() {
    setBusy(true);
    setFeedback(null);
    const ok = blockedSelf ? await unblockUser(profile.id) : await blockUser(profile.id);
    setBusy(false);
    setMoreOpen(false);
    if (ok) {
      setFeedback(
        blockedSelf
          ? `Você desbloqueou ${name}.`
          : `Você bloqueou ${name}. As mensagens antigas continuam visíveis.`,
      );
    } else {
      setFeedback(
        "Não foi possível concluir. Talvez a tabela user_blocks ainda não exista no banco — rode o script APLICAR_TUDO_NO_BANCO.sql.",
      );
    }
  }

  // Fecha o dropdown ao clicar fora dele.
  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick() {
      setMoreOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [moreOpen]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil de ${name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 lg:items-center lg:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[75vh] w-full max-w-[800px] flex-col overflow-y-auto rounded-t-2xl bg-[#313338] shadow-2xl animate-in slide-in-from-bottom duration-300 lg:max-h-[85vh] lg:min-h-[500px] lg:flex-row lg:overflow-hidden lg:rounded-xl lg:animate-in lg:fade-in lg:zoom-in-95 lg:slide-in-from-bottom-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fechar (X) — canto superior direito */}
        <button
          onClick={onClose}
          title="Fechar (Esc)"
          aria-label="Fechar"
          className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full text-[#949ba4] transition-colors hover:bg-[#404249] hover:text-[#dbdee1]"
        >
          <X className="size-5" />
        </button>

        {/* Coluna esquerda (40%) — identidade */}
        <div className="w-2/5 shrink-0 overflow-y-auto bg-[#232428]">
          {/* Banner dinâmico (120-150px) */}
          <div
            className="h-[140px] w-full shrink-0"
            style={{ backgroundColor: profile.banner_color || "#11a0f4" }}
          />
          {/* Avatar enorme 120x120 sobre o banner, recorte 8px #232428 */}
          <div className="relative -mt-[60px] px-6">
            <div className="w-fit">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={name}
                  className="size-[120px] rounded-full border-[8px] border-[#232428] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
                  }}
                />
              ) : (
                <div className="flex size-[120px] items-center justify-center rounded-full border-[8px] border-[#232428] bg-[#5865F2] text-4xl font-bold text-white">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6">
            <h2 className="mt-3 truncate text-2xl font-bold text-[#dbdee1]">{name}</h2>
            {profile.username && (
              <p className="mt-0.5 text-sm text-[#949ba4]">@{profile.username}</p>
            )}

            {/* Ações horizontais */}
            <div className="mt-4 flex items-center gap-2">
              {!isSelf && (
                <button
                  onClick={goToDm}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-[#5865F2] text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
                >
                  <MessageSquare className="size-4" /> Mensagem
                </button>
              )}
              {!isSelf && (
                <button
                  title={
                    rel === "friends"
                      ? "Desfazer amizade"
                      : rel === "pending"
                        ? "Pedido de amizade enviado"
                        : "Adicionar amigo"
                  }
                  aria-label={
                    rel === "friends"
                      ? "Desfazer amizade"
                      : rel === "pending"
                        ? "Pedido de amizade enviado"
                        : "Adicionar amigo"
                  }
                  disabled={rel === "loading" || rel === "pending" || busy}
                  onClick={() => {
                    if (rel === "friends") {
                      if (window.confirm(`Desfazer amizade com ${name}? O histórico de mensagens não será apagado.`)) {
                        void handleRemoveFriend();
                      }
                    } else if (rel === "none") {
                      void handleAddFriend();
                    }
                  }}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    rel === "friends"
                      ? "bg-[#23a55a]/90 text-white hover:bg-[#1f8b4d]"
                      : "bg-[#404249] text-[#dbdee1] hover:bg-[#4e5058]"
                  }`}
                >
                  {rel === "friends" ? (
                    <UserCheck className="size-4" />
                  ) : rel === "pending" ? (
                    <UserPlus className="size-4" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                </button>
              )}
              {!isSelf && (
                <div className="relative">
                  <button
                    title="Mais opções"
                    aria-label="Mais opções"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreOpen((v) => !v);
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#404249] text-[#dbdee1] transition-colors hover:bg-[#4e5058]"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {moreOpen && (
                    <div
                      className="absolute top-full right-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-[#1e1f22] bg-[#2b2d31] py-1 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => void handleToggleBlock()}
                        disabled={busy}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#f0553c] transition-colors hover:bg-[#404249] disabled:opacity-50"
                      >
                        <Ban className="size-4 shrink-0" />
                        {blockedSelf ? `Desbloquear ${name}` : "Bloquear usuário"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {feedback && (
              <p className="mt-3 rounded-lg bg-accent/40 px-3 py-2 text-xs text-[#dbdee1]">
                {feedback}
              </p>
            )}

            {/* Seções textuais */}
            <div className="mt-6 space-y-5 text-sm">
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Membro desde
                </h3>
                <p className="mt-1 text-[#dbdee1]">{fmtDate(profile.created_at)}</p>
              </section>
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Amigos desde
                </h3>
                <p className="mt-1 text-[#dbdee1]">{fmtDate(friendsSince)}</p>
              </section>
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                  Nota
                </h3>
                <textarea
                  value={note}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder={`Clique para adicionar uma nota sobre ${name}`}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg bg-[#1e1f22] px-3 py-2 text-[#dbdee1] outline-none placeholder:text-[#949ba4] focus:ring-2 focus:ring-[#5865F2]/60"
                />
              </section>
            </div>
          </div>
        </div>

        {/* Coluna direita (60%) — atividade */}
        <div className="flex min-w-0 flex-1 flex-col p-6">
          {/* Navbar horizontal de abas */}
          <nav className="flex shrink-0 items-center gap-5 overflow-x-auto border-b border-[#3f4147]">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 border-b-2 pb-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "border-[#dbdee1] text-[#dbdee1]"
                    : "border-transparent text-[#949ba4] hover:text-[#dbdee1]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto pt-6">
            {tab === "atividade" && (
              <div className="flex h-48 items-center justify-center rounded-lg bg-[#2b2d31]/40">
                <p className="text-sm text-[#949ba4]">Nenhuma atividade recente.</p>
              </div>
            )}
            {tab === "amigos" && (
              <div className="flex h-48 items-center justify-center rounded-lg bg-[#2b2d31]/40">
                <p className="text-sm text-[#949ba4]">Vocês não têm amigos em comum.</p>
              </div>
            )}
            {tab === "servidores" && (
              <div className="flex h-48 items-center justify-center rounded-lg bg-[#2b2d31]/40">
                <p className="text-sm text-[#949ba4]">
                  Vocês não compartilham nenhum servidor.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}