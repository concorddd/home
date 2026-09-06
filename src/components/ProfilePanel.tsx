import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Trash } from "lucide-react";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

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
      className="fixed inset-y-0 right-0 z-40 flex w-[33vw] min-w-[22rem] max-w-[35vw] flex-col border-l border-[#242629] bg-[#1a1b1e] shadow-2xl animate-in slide-in-from-right"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Banner de destaque */}
      <div className="shrink-0">
        <div className="relative h-28 w-full bg-[#f9a620]" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Cabeçalho do painel */}
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-[#c7c8cc]">Perfil</h3>
          {!isSelf && (
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-[#808287] transition-colors hover:bg-[#282a2e] hover:text-[#c7c8cc]"
              title="Fechar"
            >
              ✕
            </button>
          )}
        </div>

        {/* Avatar sobre o banner */}
        <div className="-mt-12 flex justify-center">
          <div className="rounded-full bg-[#1a1b1e] p-1">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={name}
                className="size-24 rounded-full object-cover ring-4 ring-[#f9a620]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
                }}
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-full bg-[#f9a620] text-2xl font-bold text-[#1a1b1e] ring-4 ring-[#f9a620]">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Identidade */}
        <div className="px-5 pt-3 text-center">
          <h2 className="text-xl font-semibold text-[#c7c8cc]">{name}</h2>
          {profile.username && profile.username.length > 0 && (
            <p className="mb-3 text-sm text-[#808287]">@{profile.username}</p>
          )}

          {profile.bio ? (
            <p className="mb-2 break-words text-sm text-[#c7c8cc]">{profile.bio}</p>
          ) : (
            <p className="mb-2 text-sm italic text-[#808287]">Sem descricao.</p>
          )}

          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#c7c8cc]">
            <span
              className={`size-2 rounded-full ${
                profile.is_online
                  ? "bg-[#f9a620]"
                  : profile.status === "ausente"
                    ? "bg-[#f9a620]/70"
                    : "bg-[#808287]"
              }`}
            />
            <span>{profile.is_online ? "Online" : profile.status === "ausente" ? "Ausente" : "Offline"}</span>
          </div>

          {profile.created_at && profile.created_at.length > 0 && (
            <p className="mt-2 text-xs text-[#808287]">
              Membro desde: {new Date(profile.created_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        {/* Ações no rodapé */}
        <div className="mt-auto border-t border-[#242629] p-3">
          <button
            onClick={openFullProfile}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f9a620] px-4 py-2.5 text-sm font-semibold text-[#1a1b1e] transition-colors hover:bg-[#f9a620]/90"
          >
            <ExternalLink className="size-4" /> Ver perfil completo
          </button>
          {!isSelf && (
            <div className="relative mt-1">
              <button
                onClick={() => setShowConfirm(true)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-[#f0553c] hover:bg-[#282a2e]"
              >
                <Trash className="size-4" /> Remover amigo
              </button>
              {showConfirm && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                  onClick={() => setShowConfirm(false)}
                >
                  <div className="max-w-sm rounded-lg bg-[#1a1b1e] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <h4 className="mb-2 font-semibold text-[#c7c8cc]">Remover amigo?</h4>
                    <p className="mb-4 text-sm text-[#808287]">Voce sera removido dos amigos de {name}.</p>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={removing}
                        className="rounded bg-[#282a2e] px-4 py-2 text-sm text-[#c7c8cc] hover:bg-[#1a1b1e]"
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

