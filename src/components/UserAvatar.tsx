import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function UserAvatar({
  username,
  avatarUrl,
  className,
}: {
  username: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  // Se a URL mudar (upload de nova foto), limpa o estado de erro.
  useEffect(() => setBroken(false), [avatarUrl]);
  const initials = (username || "?").slice(0, 2).toUpperCase();

  // Se a imagem do storage falhar (404/expirada), cai para as iniciais
  // em vez de renderizar um <img> vazio.
  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={`Avatar de ${username}`}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn("size-8 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-accent text-[11px] font-bold",
        className,
      )}
    >
      {initials}
    </div>
  );
}
