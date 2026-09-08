import { useRef, useState } from "react";
import { Bell, Menu, MessagesSquare, Home } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";

/**
 * Arquitetura App Shell (mobile-first, espelhando o Discord mobile):
 * - Wrapper: no desktop as sidebars ficam estáticas; no mobile viram gavetas
 *   off-canvas que deslizam sobre o chat.
 */

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/** Gaveta esquerda — cobre 85% da tela e recebe 2 colunas (rail + lista). */
export function SideDrawer({ open, onClose, children }: DrawerProps) {
  const [startX, setStartX] = useState<number | null>(null);

  /** Swipe da esquerda para a direita fecha. */
  function onDrawerTouchStart(e: React.TouchEvent) {
    setStartX(e.touches[0]!.clientX);
  }
  function onDrawerTouchEnd(e: React.TouchEvent) {
    if (startX === null) return;
    const endX = e.changedTouches[0]!.clientX;
    const dx = endX - startX;
    setStartX(null);
    if (dx > 40) onClose();
  }

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}
      {/* Gaveta mobile (off-canvas, 85vw) */}
      <div
        onTouchStart={onDrawerTouchStart}
        onTouchEnd={onDrawerTouchEnd}
        onClick={onClose}
        className={
          open
            ? "fixed inset-y-0 left-0 z-50 flex max-w-[85vw] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden"
            : "hidden"
        }
      >
        {children}
      </div>
      {/* Desktop: versão estática (colunas sempre visíveis) */}
      <div className="hidden lg:flex" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </>
  );
}

/** Gaveta direita — membros do servidor, cobre 85% da tela. */
export function RightDrawer({
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
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <div
        className={
          open
            ? "fixed inset-y-0 right-0 z-[75] flex w-[85vw] flex-col bg-channels shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden"
            : "hidden"
        }
        style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

/** Faixa invisível na borda esquerda: swipe da esquerda p/ direita abre a gaveta. */
export function SwipeEdgeOpener({ onOpen }: { onOpen: () => void }) {
  const startX = useRef<number | null>(null);
  return (
    <div
      aria-hidden
      className="fixed inset-y-0 left-0 z-30 w-5 lg:hidden"
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0]!.clientX - startX.current;
        startX.current = null;
        if (dx > 40) onOpen();
      }}
    />
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir menu"
      className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground lg:hidden"
    >
      <Menu className="size-5" />
    </button>
  );
}

/** Barra de navegação inferior (mobile) — 4 ícones estilo Discord. */
export function BottomNav({
  onServers,
  onProfile,
}: {
  onServers: () => void;
  onProfile: () => void;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const item =
    "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium text-[#949ba4] transition-colors active:text-[#dbdee1]";

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-[#000000]/60 bg-[#1e1f22] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <button className={item} onClick={onServers} aria-label="Início / Servidores">
        <Home className="size-6" />
        Início
      </button>
      <button
        className={item}
        onClick={() => navigate({ to: "/amigos" })}
        aria-label="Mensagens diretas"
      >
        <MessagesSquare className="size-6" />
        Mensagens
      </button>
      <button
        className={item}
        onClick={() => navigate({ to: "/amigos" })}
        aria-label="Notificações"
      >
        <Bell className="size-6" />
        Notificações
      </button>
      <button
        className={item}
        onClick={onProfile}
        aria-label="Perfil / Configurações"
      >
        <UserAvatar
          username={profile?.username ?? "?"}
          avatarUrl={profile?.avatar_url ?? null}
          className="size-7"
        />
        Perfil
      </button>
    </nav>
  );
}

/** Compatibilidade com a API antiga usada na rota amigos. */
export function MobileTabBar({
  onServers,
  onProfile,
}: {
  active: "home" | "servers" | "alerts" | "profile";
  onServers: () => void;
  onProfile: () => void;
}) {
  return <BottomNav onServers={onServers} onProfile={onProfile} />;
}
