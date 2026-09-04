type PinnedMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
};

type Props = {
  pinnedMessages: PinnedMessage[];
  onClose: () => void;
};

export function PinnedMessagesPanel({ pinnedMessages, onClose }: Props) {
  if (pinnedMessages.length === 0) {
    return (
      <div className="border-b border-[#1e1f22] bg-[#2b2d31] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Mensagens Fixadas</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-400">Nenhuma mensagem fixada.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-[#1e1f22] bg-[#2b2d31] p-4 max-h-60 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Mensagens Fixadas</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          ✕
        </button>
      </div>
      <div className="space-y-2">
        {pinnedMessages.map((msg) => (
          <div key={msg.id} className="rounded bg-[#1e1f22] p-2">
            <p className="text-sm text-gray-300 line-clamp-2">{msg.content}</p>
            <p className="mt-1 text-xs text-gray-500">
              {new Date(msg.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
