import {
  SmilePlus,
  Reply,
  Forward,
  Copy,
  Pin,
  Mail,
  Link,
  Volume2,
  Flag,
  Trash2,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  isOwn: boolean;
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

/**
 * Bottom sheet de ações da mensagem para mobile (long press ou toque no
 * botão "mais"): espelha o menu de contexto do desktop em formato nativo.
 */
export function MessageActionSheet({
  open,
  onClose,
  isOwn,
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
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#dbdee1] transition-colors active:bg-[#404249]";
  const itemRed =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#da373c] transition-colors active:bg-[#da373c]/20";
  const iconCls = "size-4 shrink-0";

  return (
    <BottomSheet open={open} onClose={onClose} title="Ações da mensagem">
      {/* Reações rápidas */}
      <div className="px-2 pb-2">
        <div className="flex items-center justify-around rounded-xl bg-[#1e1f22] p-1.5">
          {REACTIONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                onReact();
                onClose();
              }}
              className="flex size-11 items-center justify-center rounded-lg text-xl transition-transform active:scale-125"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 py-1">
        <button className={item} onClick={() => { onReact(); onClose(); }}>
          <SmilePlus className={iconCls} />
          Adicionar reação
        </button>
        <button className={item} onClick={() => { onReply(); onClose(); }}>
          <Reply className={iconCls} />
          Responder
        </button>
        <button className={item} onClick={() => { onForward(); onClose(); }}>
          <Forward className={iconCls} />
          Encaminhar
        </button>
      </div>

      <div className="mx-4 my-1 border-b border-[#313338]" />

      <div className="px-2 py-1">
        <button className={item} onClick={() => { onCopyText(); onClose(); }}>
          <Copy className={iconCls} />
          Copiar texto
        </button>
        <button className={item} onClick={() => { onPin(); onClose(); }}>
          <Pin className={iconCls} />
          Fixar mensagem
        </button>
        <button className={item} onClick={() => { onMarkUnread(); onClose(); }}>
          <Mail className={iconCls} />
          Marcar como não lido
        </button>
        <button className={item} onClick={() => { onCopyLink(); onClose(); }}>
          <Link className={iconCls} />
          Copiar link da mensagem
        </button>
        <button className={item} onClick={() => { onSpeak(); onClose(); }}>
          <Volume2 className={iconCls} />
          Falar mensagem
        </button>
      </div>

      {isOwn && onDelete && (
        <>
          <div className="mx-4 my-1 border-b border-[#313338]" />
          <div className="px-2 py-1">
            <button className={itemRed} onClick={() => { onDelete(); onClose(); }}>
              <Trash2 className={iconCls} />
              Apagar mensagem
            </button>
          </div>
        </>
      )}

      <div className="mx-4 my-1 border-b border-[#313338]" />

      <div className="px-2 py-1">
        <button className={itemRed} onClick={() => { onReport(); onClose(); }}>
          <Flag className={iconCls} />
          Denunciar mensagem
        </button>
      </div>
    </BottomSheet>
  );
}