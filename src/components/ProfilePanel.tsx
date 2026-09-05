import { UserAvatar } from "./UserAvatar";
import { SmartStatusDot } from "./StatusDot";
import { UserCheck, MoreHorizontal } from "lucide-react";

type ProfileLike = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  status?: string;
  is_online?: boolean;
  last_active_at?: string;
  created_at?: string;
};

type Props = {
  profile: ProfileLike | null;
  onClose: () => void;
};

export function ProfilePanel({ profile, onClose }: Props) {
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[#1e1f22] bg-[#2b2d31] overflow-y-auto hidden lg:flex">
      {/* Banner */}
      <div className="relative h-24 bg-gradient-to-br from-[#5865F2] to-[#EB459E]">
        {/* Botões de ação no banner */}
        <div className="absolute top-2 right-2 flex gap-1">
          <button className="rounded-full bg-black/40 p-1.5 text-white/80 hover:bg-black/60 hover:text-white transition-colors">
            <UserCheck className="size-4" />
          </button>
          <button className="rounded-full bg-black/40 p-1.5 text-white/80 hover:bg-black/60 hover:text-white transition-colors">
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Avatar flutuante */}
      <div className="relative px-4">
        <div className="absolute -top-10">
          <div className="relative">
            <UserAvatar
              username={profile?.username ?? "?"}
              avatarUrl={profile?.avatar_url ?? null}
              className="size-20 border-[6px] border-[#2b2d31] text-2xl"
            />
            <SmartStatusDot
              status={profile?.status}
              isOnline={profile?.is_online}
              lastActiveAt={profile?.last_active_at}
              ring="border-[#2b2d31]"
              className="size-5 border-[3px]"
            />
          </div>
        </div>
      </div>

      {/* Informações do usuário */}
      <div className="mt-14 px-4 pb-4">
        <div className="rounded-lg bg-[#1e1f22] p-4">
          <h2 className="text-lg font-bold text-white">
            {profile?.display_name || profile?.username || "—"}
          </h2>
          <p className="text-sm text-gray-400">@{profile?.username ?? "—"}</p>

          {/* Bio */}
          {profile?.bio && (
            <div className="mt-3 pt-3 border-t border-[#3f4147]">
              <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Sobre mim</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {/* Membro desde */}
          <div className="mt-3 pt-3 border-t border-[#3f4147]">
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Membro desde</p>
            <p className="text-sm text-gray-300">{memberSince}</p>
          </div>
        </div>

        {/* Botão Ver Perfil Completo */}
        <button className="mt-3 w-full rounded-md bg-[#404249] py-2 text-sm font-medium text-white hover:bg-[#4e5058] transition-colors">
          Ver Perfil Completo
        </button>
      </div>
    </aside>
  );
}
