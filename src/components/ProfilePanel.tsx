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
    <aside className="fixed inset-y-0 right-0 w-80 border-l bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Perfil</h3>
          {!isSelf && (<button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent" title="Fechar"> x </button>)}
        </div>
        <div className="flex justify-center py-4">
          {profile.avatar_url ? (<img src={profile.avatar_url} alt={name} className="size-24 rounded-full object-cover border-2 border-accent" onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`; }} />) : (<div className="size-24 rounded-full bg-accent flex items-center justify-center text-2xl font-bold">{name.charAt(0).toUpperCase()}</div>)}
        </div>
        <div className="px-4">
          <h2 className="text-center text-xl font-semibold">{name}</h2>
          {profile.username && profile.username.length > 0 && (<p className="text-center text-sm text-muted-foreground mb-3">@{profile.username}</p>)}
          {profile.bio && <p className="text-sm text-foreground/80 mb-2 break-words">{profile.bio}</p>}
          {!profile.bio && <p className="text-sm text-muted-foreground mb-2 italic">Sem descricao.</p>}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className={`size-2 rounded-full ${profile.is_online ? "bg-green-500" : profile.status === "ausente" ? "bg-yellow-500" : "bg-gray-500"}`} />
            <span>{profile.is_online ? "Online" : profile.status === "ausente" ? "Ausente" : "Offline"}</span>
          </div>
          {profile.created_at && profile.created_at.length > 0 && (<p className="text-xs text-muted-foreground mt-2">Membro desde: {new Date(profile.created_at).toLocaleDateString("pt-BR")}</p>)}
        </div>
        <div className="mt-auto border-t p-2">
          <button onClick={openFullProfile} className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-accent"><ExternalLink className="size-4" /> Ver perfil completo</button>
          {!isSelf && (<div className="relative">
            <button onClick={() => setShowConfirm(true)} className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-red-400 hover:bg-red/10"><Trash className="size-4" /> Remover amigo</button>
            {showConfirm && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfirm(false)}><div className="rounded-lg bg-popover p-5 shadow-xl max-w-sm" onClick={(e) => e.stopPropagation()}><h4 className="font-semibold mb-2">Remover amigo?</h4><p className="text-sm text-muted-foreground mb-4">Voce sera removido dos amigos de {name}.</p><div className="flex justify-end gap-2"><button onClick={() => setShowConfirm(false)} disabled={removing} className="px-4 py-2 text-sm rounded hover:bg-accent">Cancelar</button><button onClick={handleRemoveFriend} disabled={removing} className="px-4 py-2 text-sm text-white bg-red-500 rounded">{removing ? "Removendo..." : "Confirmar"}</button></div></div></div>)}
          </div>)}
        </div>
      </div>
    </aside>
  );
}

