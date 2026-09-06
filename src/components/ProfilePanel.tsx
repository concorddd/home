import { MoreHorizontal, StickyNote, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SmartStatusDot } from "@/components/StatusDot";
import { ProfileModal } from "@/components/ProfileModal";
import { useEffect, useState } from "react";

export type Peer = Profile;

type Props = {
  profile: Peer;
  onClose: () => void;
};

export function ProfilePanel({ profile, onClose }: Props) {
  const { user } = useAuth();
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [friendState, setFriendState] = useState<
    "loading" | "none" | "pending" | "friends"
  >("loading");

  const name = profile.display_name || profile.username || "Usuario";
  const isSelf = profile.id === user?.id;

  // Fecha com a tecla Esc
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Estado de amizade com esta pessoa (controla o botão +/− do banner).
  useEffect(() => {
    if (!user || isSelf) return;
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
      setFriendState(st === "accepted" ? "friends" : st === "pending" ? "pending" : "none");
    })();
    return () => {
      alive = false;
    };
  }, [user, profile.id, isSelf]);

  async function handleAddFriend() {
    if (!user) return;
    setFriendState("pending");
    const pair = `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`;
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: profile.id, status: "pending" });
    if (error) {
      // Pedido pode já existir: consulta o estado real antes de exibir.
      const { data } = await supabase
        .from("friendships")
        .select("status")
        .or(pair)
        .limit(1)
        .maybeSingle();
      const st = (data as { status: string } | null)?.status;
      setFriendState(st === "accepted" ? "friends" : st === "pending" ? "pending" : "none");
    }
  }

  async function handleRemoveFriend() {
    if (!user || !showConfirm) return;
    setRemoving(true);
    try {
      await supabase.from("friendships").delete().or(`and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`);
      onClose();
    } finally {
      setRemoving(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      <aside
        className="hidden w-[340px] shrink-0 flex-col border-l border-[#1e1f22] bg-panel-perfil shadow-2xl animate-in fade-in lg:flex"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Banner de destaque — cor dinâmica do usuário (fallback #11a0f4) */}
      <div className="shrink-0">
        <div
          className="relative h-[120px] w-full"
          style={{ backgroundColor: profile.banner_color || "#11a0f4" }}
        >
          {!isSelf && (
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                title={
                  friendState === "friends"
                    ? "Remover amigo"
                    : friendState === "pending"
                      ? "Pedido de amizade pendente"
                      : "Adicionar amigo"
                }
                aria-label={
                  friendState === "friends"
                    ? "Remover amigo"
                    : friendState === "pending"
                      ? "Pedido de amizade pendente"
                      : "Adicionar amigo"
                }
                disabled={friendState === "loading" || friendState === "pending"}
                onClick={() =>
                  friendState === "friends" ? setShowConfirm(true) : void handleAddFriend()
                }
                className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {friendState === "friends" ? (
                  <UserMinus className="size-4" />
                ) : friendState === "pending" ? (
                  <UserCheck className="size-4" />
                ) : (
                  <UserPlus className="size-4" />
                )}
              </button>
              <button
                title="Ver perfil completo"
                aria-label="Ver perfil completo"
                onClick={() => setModalOpen(true)}
                className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Avatar 80x80 alinhado à esquerda, colidindo com o banner (por cima) */}
        <div className="relative -mt-[95px] px-4">
          <div className="relative w-fit">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={name}
                className="size-20 rounded-full border-[6px] border-panel-perfil object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
                }}
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full border-[6px] border-panel-perfil bg-[#5865F2] text-2xl font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Ícone de status no canto inferior direito do avatar */}
            <SmartStatusDot
              status={profile.status}
              isOnline={profile.is_online}
              lastActiveAt={profile.last_active_at}
              ring="border-panel-perfil"
              className="absolute right-0 bottom-0 size-5 border-4"
            />
          </div>
        </div>

        {/* Identidade */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-lg font-bold text-[#dbdee1]">{name}</h2>
            <StickyNote className="size-4 shrink-0 text-[#949ba4]" aria-label="Nota" />
          </div>
          {profile.username && profile.username.length > 0 && (
            <p className="mb-3 text-sm text-[#949ba4]">@{profile.username}</p>
          )}

          {profile.bio ? (
            <p className="mb-2 break-words text-sm text-[#dbdee1]">{profile.bio}</p>
          ) : (
            <p className="mb-2 text-sm italic text-[#949ba4]">Sem descricao.</p>
          )}

          <div className="mt-3 flex items-center gap-2 text-sm text-[#dbdee1]">
            <span
              className={`size-2 rounded-full ${
                profile.is_online
                  ? "bg-[#23a55a]"
                  : profile.status === "ausente"
                    ? "bg-[#faa81a]"
                    : "bg-[#949ba4]"
              }`}
            />
            <span>{profile.is_online ? "Online" : profile.status === "ausente" ? "Ausente" : "Offline"}</span>
          </div>

          {profile.created_at && profile.created_at.length > 0 && (
            <p className="mt-2 text-xs text-[#949ba4]">
              Membro desde: {new Date(profile.created_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        {/* Ações no rodapé */}
        <div className="mt-auto border-t border-[#2b2d31] p-3">
          <button
            onClick={() => setModalOpen(true)}
            className="flex w-full items-center justify-center rounded-lg bg-[#404249] px-4 py-2.5 text-sm font-semibold text-[#dbdee1] transition-colors hover:bg-[#4e5058]"
          >
            Ver Perfil Completo
          </button>
        </div>
      </div>
      </aside>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowConfirm(false)}
        >
          <div className="max-w-sm rounded-lg bg-panel-perfil p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-2 font-semibold text-[#dbdee1]">Remover amigo?</h4>
            <p className="mb-4 text-sm text-[#949ba4]">Vocês deixarão de ser amigos no Concord.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={removing}
                className="rounded bg-[#404249] px-4 py-2 text-sm text-[#dbdee1] hover:bg-[#313338]"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemoveFriend}
                disabled={removing}
                className="rounded bg-[#da373c] px-4 py-2 text-sm text-white"
              >
                {removing ? "Removendo..." : "Remover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && <ProfileModal profile={profile} onClose={() => setModalOpen(false)} />}
    </>
  );
}

