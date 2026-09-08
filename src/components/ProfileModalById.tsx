// Abre o perfil flutuante de qualquer usuário a partir do ID, carregando os
// dados dinamicamente. Usado nos cliques em avatar/nome no cabeçalho das
// mensagens (DMs e canais) e nos itens da lista de membros.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/useAuth";
import { ProfileModal } from "@/components/ProfileModal";

export type FriendRel = "loading" | "none" | "pending" | "friends";

export async function loadProfileById(userId: string): Promise<Profile | null> {
  // Tenta com as colunas novas; se a migração ainda não tiver sido aplicada,
  // refaz sem elas para nunca quebrar a abertura do modal.
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

export function ProfileModalById({
  userId,
  onClose,
  onFriendStateChange,
}: {
  userId: string;
  onClose: () => void;
  /** Chamado quando a relação de amizade muda no modal (para a tela reagir). */
  onFriendStateChange?: (rel: "none" | "pending" | "friends") => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setFailed(false);
    void loadProfileById(userId)
      .then((p) => {
        if (!alive) return;
        if (p) setProfile(p);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (failed) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onClick={onClose}
      >
        <div
          className="rounded-xl bg-[#313338] px-6 py-5 text-sm text-[#949ba4]"
          onClick={(e) => e.stopPropagation()}
        >
          Não foi possível carregar o perfil.
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        onClick={onClose}
      >
        <div
          className="flex items-center gap-2 rounded-xl bg-[#313338] px-6 py-5 text-sm text-[#949ba4]"
          onClick={(e) => e.stopPropagation()}
        >
          <Loader2 className="size-4 animate-spin" /> Carregando perfil…
        </div>
      </div>
    );
  }

  return (
    <ProfileModal
      profile={profile}
      onClose={onClose}
      onFriendStateChange={onFriendStateChange}
    />
  );
}