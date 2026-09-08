import { Link, Mail, Pin, SmilePlus, Reply, Forward, MoreHorizontal, Trash2 } from "lucide-react";

type Props = {
  isOwn: boolean;
  isPinned: boolean;
  onPin: () => void;
  onDelete: () => void;
  onReply?: () => void;
  onReact?: () => void;
  onCopyLink?: () => void;
  onMarkUnread?: () => void;
  onForward?: () => void;
  onMore?: (e: React.MouseEvent) => void;
};

export function MessageHoverMenu({
  isOwn,
  isPinned,
  onPin,
  onDelete,
  onReply,
  onReact,
  onCopyLink,
  onMarkUnread,
  onForward,
  onMore,
}: Props) {
  const btn =
    "p-1.5 rounded text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#404249] transition-colors";
  return (
    <div className="message-hover-menu absolute -top-3 -right-1 z-20 flex items-center gap-0.5 rounded-lg border border-[#1e1f22] bg-[#2b2d31] px-1 py-0.5 shadow-lg">
      {onCopyLink && (
        <button
          className={btn}
          title="Copiar link da mensagem"
          onClick={(e) => {
            e.stopPropagation();
            onCopyLink();
          }}
        >
          <Link className="size-3.5" />
        </button>
      )}
      {onMarkUnread && (
        <button
          className={btn}
          title="Marcar como não lido"
          onClick={(e) => {
            e.stopPropagation();
            onMarkUnread();
          }}
        >
          <Mail className="size-3.5" />
        </button>
      )}
      <button
        className={`${btn} ${isPinned ? "text-[#5865F2]" : ""}`}
        title={isPinned ? "Desafixar mensagem" : "Fixar mensagem"}
        onClick={(e) => {
          e.stopPropagation();
          onPin();
        }}
      >
        <Pin className="size-3.5" />
      </button>
      {onReact && (
        <button
          className={btn}
          title="Reagir"
          onClick={(e) => {
            e.stopPropagation();
            onReact();
          }}
        >
          <SmilePlus className="size-3.5" />
        </button>
      )}
      {onReply && (
        <button
          className={btn}
          title="Responder"
          onClick={(e) => {
            e.stopPropagation();
            onReply();
          }}
        >
          <Reply className="size-3.5" />
        </button>
      )}
      {onForward && (
        <button
          className={btn}
          title="Encaminhar"
          onClick={(e) => {
            e.stopPropagation();
            onForward();
          }}
        >
          <Forward className="size-3.5" />
        </button>
      )}
      {isOwn && (
        <button
          className={`${btn} hover:text-red-400`}
          title="Apagar mensagem"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      {onMore && (
        <button
          className={btn}
          title="Mais opções"
          onClick={(e) => {
            e.stopPropagation();
            onMore(e);
          }}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      )}
    </div>
  );
}
