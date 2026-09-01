const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
  "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐",
  "😑","😶","😏","😒","🙄","😬","😴","🤤","😪","😵","🤯","🥳","😎","🤓","🧐","😕",
  "😟","🙁","😢","😭","😤","😠","😡","🤬","😱","😨","😰","😥","🥺","👍","👎","👌",
  "✌️","🤞","🤟","🤘","👏","🙌","🙏","💪","🔥","✨","🎉","🎊","❤️","🧡","💛","💚",
  "💙","💜","🖤","💯","👀","🚀","⭐","⚡","🍕","🍔","☕","🎮","🎧","💻","📎","🐱",
];

export function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-xl bg-channels p-3 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.06]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Emojis
        </span>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
          type="button"
        >
          Fechar
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onSelect(e)}
            className="rounded-md p-1 text-lg transition-transform hover:scale-125 hover:bg-accent/60"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
