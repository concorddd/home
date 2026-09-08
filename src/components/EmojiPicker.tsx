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
    <div
      className="fixed inset-x-0 bottom-0 z-[80] w-full rounded-t-2xl bg-channels p-3 shadow-[0_-24px_64px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.06] animate-in slide-in-from-bottom duration-200 lg:absolute lg:bottom-full lg:right-0 lg:z-30 lg:mb-2 lg:w-72 lg:rounded-xl lg:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.8)] lg:animate-none"
    >
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
      <div className="grid max-h-[40vh] grid-cols-8 gap-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] lg:max-h-56 lg:pb-0">
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
