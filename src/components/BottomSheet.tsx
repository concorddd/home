import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom Sheet genérico (padrão mobile nativo, estilo iOS/Android):
 * desliza de baixo para cima ocupando até 70% da tela, com overlay escuro,
 * handle de arraste no topo e fechamento por Esc / clique no overlay.
 *
 * No desktop (>= lg) o conteúdo pode simplesmente não ser usado — as telas
 * desktop mantêm seus próprios painéis fixos.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Painel que desliza de baixo */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#2b2d31] shadow-[0_-24px_64px_-16px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-[#404249]" />
        </div>
        {title && (
          <div className="shrink-0 px-5 pb-2 text-center">
            <h2 className="text-sm font-semibold text-[#dbdee1]">{title}</h2>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}