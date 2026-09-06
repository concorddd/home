import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Trash } from "lucide-react";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type Peer = Profile;

type Props = {
  profile: Peer;
  onClose: () => void;
};

export function ProfilePanel({ profile, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  async function openFullProfile() {
    onClose();
    navigate({ to: "/perfil/$userId", params: { userId: profile.id } });
  }

  return (
    <aside
      className="hidden w-[340px] shrink-0 flex-col border-l border-[#1e1f22] bg-panel-perfil shadow-2xl animate-in fade-in lg:flex"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Banner de destaque — cor dinâmica do usuário (fallback #11a0f4) */}
      <div className="shrink-0">
        <div
          className="relative h-[120px] w-full"
          style={{ backgroundColor: profile.banner_color || "#11a0f4" }}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Cabeçalho do painel */}
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-[#dbdee1]">Perfil</h3>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-[#949ba4] transition-colors hover:bg-[#404249] hover:text-[#dbdee1]"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Avatar 80x80 sobre o banner, com recorte estático na cor do painel */}
        <div className="-mt-10 flex justify-center">
          <div className="rounded-full">
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
          </div>
        </div>

        {/* Identidade */}
        <div className="px-5 pt-3 text-center">
          <h2 className="text-xl font-semibold text-[#dbdee1]">{name}</h2>
          {profile.username && profile.username.length > 0 && (
            <p className="mb-3 text-sm text-[#949ba4]">@{profile.username}</p>
          )}

          {profile.bio ? (
            <p className="mb-2 break-words text-sm text-[#dbdee1]">{profile.bio}</p>
          ) : (
            <p className="mb-2 text-sm italic text-[#949ba4]">Sem descricao.</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#dbdee1]">
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
            onClick={openFullProfile}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#404249] px-4 py-2.5 text-sm font-semibold text-[#dbdee1] transition-colors hover:bg-[#4e5058]"
          >
            <ExternalLink className="size-4" /> Ver perfil completo
          </button>
          {!isSelf && (
            <div className="relative mt-1">
              <button
                onClick={() => setShowConfirm(true)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-[#f0553c] hover:bg-[#404249]"
              >
                <Trash className="size-4" /> Remover amigo
              </button>
              {showConfirm && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                  onClick={() => setShowConfirm(false)}
                >
                  <div className="max-w-sm rounded-lg bg-panel-perfil p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <h4 className="mb-2 font-semibold text-[#dbdee1]">Remover amigo?</h4>
                    <p className="mb-4 text-sm text-[#949ba4]">Voce sera removido dos amigos de {name}.</p>
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
                        {removing ? "Removendo..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

