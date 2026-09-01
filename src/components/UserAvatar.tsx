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
  const initials = username.slice(0, 2).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`Avatar de ${username}`}
        loading="lazy"
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
