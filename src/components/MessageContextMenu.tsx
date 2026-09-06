import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SmilePlus,
  Reply,
  Forward,
  Copy,
  Pin,
  LayoutGrid,
  Mail,
  Link,
  Volume2,
  Flag,
  ChevronRight,
} from "lucide-react";

type Props = {
  x: number;
  y: number;
  isOwn: boolean;
  onClose: () => void;
  onReact: () => void;
  onReply: () => void;
  onForward: () => void;
  onCopyText: () => void;
  onPin: () => void;
  onMarkUnread: () => void;
  onCopyLink: () => void;
  onSpeak: () => void;
  onReport: () => void;
  onDelete?: () => void;
};

const REACTIONS = ["😀", "😂", "❤️", "👍"];

export function MessageContextMenu({
  x,
  y,
  isOwn,
  onClose,
  onReact,
  onReply,
  onForward,
  onCopyText,
  onPin,
  onMarkUnread,
  onCopyLink,
  onSpeak,
  onReport,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (x + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    setPos({ x: nx, y: ny });
    setReady(true);
  }, [x, y]);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const scrollHandler = () => onClose();
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", scrollHandler, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", scrollHandler, true);
    };
  }, [onClose]);

  const item =
    "flex items-center gap-3 px-3 py-2 text-sm text-[#dbdee1] rounded-[4px] cursor-pointer transition-colors select-none hover:bg-[#5865F2] hover:text-white";
  const itemRed =
    "flex items-center gap-3 px-3 py-2 text-sm text-[#da373c] rounded-[4px] cursor-pointer transition-colors select-none hover:bg-[#da373c] hover:text-white";
  const iconCls = "size-4 shrink-0";
  const sub = "ml-auto size-3 text-[#949ba4]";

  const menu = (
    <div
      ref={ref}
      className={`fixed z-[9999] w-[220px] rounded-lg bg-[#111214] py-1.5 shadow-2xl border border-[#1e1f22] select-none transition-opacity duration-75 ${ready ? "opacity-100" : "opacity-0"}`}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Reações rápidas */}
      <div className="px-2 pb-1.5">
        <div className="flex items-center gap-1">
          {REACTIONS.map((r) => (
            <button
              key={r}
              onClick={onReact}
              className="flex size-8 items-center justify-center rounded-md bg-[#2b2d31] text-base hover:bg-[#404249] transition-colors"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-2 border-b border-[#313338]" />

      <div className="px-2 pt-1.5">
        <button className={item} onClick={onReact}>
          <SmilePlus className={iconCls} />
          Adicionar reação
          <ChevronRight className={sub} />
        </button>
        <button className={item} onClick={onReply}>
          <Reply className={iconCls} />
          Responder
        </button>
        <button className={item} onClick={onForward}>
          <Forward className={iconCls} />
          Encaminhar
        </button>
      </div>

      <div className="mx-2 my-1 border-b border-[#313338]" />

      <div className="px-2">
        <button className={item} onClick={onCopyText}>
          <Copy className={iconCls} />
          Copiar texto
        </button>
        <button className={item} onClick={onPin}>
          <Pin className={iconCls} />
          Fixar mensagem
        </button>
        <button className={item} onClick={() => {}}>
          <LayoutGrid className={iconCls} />
          Apps
          <ChevronRight className={sub} />
        </button>
        <button className={item} onClick={onMarkUnread}>
          <Mail className={iconCls} />
          Marcar como não lido
        </button>
        <button className={item} onClick={onCopyLink}>
          <Link className={iconCls} />
          Copiar link da mensagem
        </button>
        <button className={item} onClick={onSpeak}>
          <Volume2 className={iconCls} />
          Falar mensagem
        </button>
      </div>

      {isOwn && onDelete && (
        <>
          <div className="mx-2 my-1 border-b border-[#313338]" />
          <div className="px-2">
            <button className={itemRed} onClick={onDelete}>
              <Copy className={iconCls} />
              Apagar mensagem
            </button>
          </div>
        </>
      )}

      <div className="mx-2 my-1 border-b border-[#313338]" />

      <div className="px-2">
        <button className={itemRed} onClick={onReport}>
          <Flag className={iconCls} />
          Denunciar mensagem
        </button>
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}