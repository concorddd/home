import { Bell, Compass, Menu, MessagesSquare, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

/** Wrapper: static sidebars on desktop, slide-in drawer on mobile. */
export function SideDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      )}
      <div
        onClick={onClose}
        className={`h-full ${
          open
            ? "fixed inset-y-0 left-0 z-50 flex max-w-[88vw] shadow-2xl"
            : "hidden"
        } md:static md:z-auto md:flex md:max-w-none md:shadow-none`}
      >
        {children}
      </div>
    </>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir menu"
      className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground md:hidden"
    >
      <Menu className="size-5" />
    </button>
  );
}

/** Bottom tab bar (mobile only). */
export function MobileTabBar({
  active,
  onServers,
  onProfile,
}: {
  active: "home" | "servers" | "alerts" | "profile";
  onServers: () => void;
  onProfile: () => void;
}) {
  const navigate = useNavigate();
  const base =
    "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition-colors";
  const cls = (key: string) =>
    `${base} ${active === key ? "text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <nav
      aria-label="Navegação principal"
      className="flex shrink-0 items-center gap-1 border-t border-border/60 bg-servers px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 md:hidden"
    >
      <button className={cls("home")} onClick={() => navigate({ to: "/amigos" })}>
        <MessagesSquare className="size-6" />
        Início
      </button>
      <button className={cls("servers")} onClick={onServers}>
        <Compass className="size-6" />
        Servidores
      </button>
      <button
        className={cls("alerts")}
        onClick={() => navigate({ to: "/amigos" })}
      >
        <Bell className="size-6" />
        Notificações
      </button>
      <button className={cls("profile")} onClick={onProfile}>
        <User className="size-6" />
        Perfil
      </button>
    </nav>
  );
}
