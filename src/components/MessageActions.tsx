import { Pin, Trash2, MoreHorizontal, Copy } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Props = {
  messageId: string;
  isOwn: boolean;
  isPinned: boolean;
  onPin: () => void;
  onDelete: () => void;
  onMore?: () => void;
  children: React.ReactNode;
};

export function MessageActions({
  messageId,
  isOwn,
  isPinned,
  onPin,
  onDelete,
  onMore,
  children,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative group" ref={menuRef}>
      <div className="flex items-start gap-2">
        <div className="flex-1">{children}</div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 -mt-3 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-[#3f4147] hover:text-white transition-colors"
            title="Mais ações"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {isOwn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded p-1.5 text-gray-400 hover:bg-[#3f4147] hover:text-red-400 transition-colors"
              title="Apagar mensagem"
            >
              <Trash2 className="size-4" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className={`rounded p-1.5 transition-colors ${
              isPinned
                ? "text-[#5865F2] bg-[#5865F2]/10"
                : "text-gray-400 hover:bg-[#3f4147] hover:text-white"
            }`}
            title={isPinned ? "Desfixar mensagem" : "Fixar mensagem"}
          >
            <Pin className="size-4" />
          </button>
        </div>
      </div>

      {showMenu && (
        <div
          className={`absolute top-6 z-50 w-48 rounded-md bg-[#111214] py-1 shadow-xl border border-[#1e1f22] ${
            isOwn ? "right-0" : "left-0"
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin();
              setShowMenu(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#5865F2] hover:text-white transition-colors"
          >
            <Pin className="size-4" />
            {isPinned ? "Desfixar" : "Fixar mensagem"}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(messageId);
              setShowMenu(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#5865F2] hover:text-white transition-colors"
          >
            <Copy className="size-4" />
            Copiar ID
          </button>

          {isOwn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            >
              <Trash2 className="size-4" />
              Apagar mensagem
            </button>
          )}

          {onMore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMore();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#5865F2] hover:text-white transition-colors"
            >
              <MoreHorizontal className="size-4" />
              Mais opções
            </button>
          )}
        </div>
      )}
    </div>
  );
}
