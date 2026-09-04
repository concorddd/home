import { useMemo, useState } from "react";
import {
  X,
  Hash,
  Volume2,
  MessagesSquare,
  Lock,
  Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

type ChannelKind = "text" | "voice" | "forum";

export type CreatedChannel = {
  id: string;
  name: string;
  server_id: string | null;
  kind: string;
  category_id: string | null;
  position: number;
  is_private: boolean;
};

const KIND_OPTIONS: {
  id: ChannelKind;
  title: string;
  description: string;
  icon: typeof Hash;
  prefixIcon: typeof Hash;
}[] = [
  {
    id: "text",
    title: "Texto",
    description: "Envie mensagens, imagens, GIFs, emojis, opiniões e humor",
    icon: Hash,
    prefixIcon: Hash,
  },
  {
    id: "voice",
    title: "Voz",
    description: "Junte-se, converse, compartilhe vídeos e divirta-se com jogos",
    icon: Volume2,
    prefixIcon: Volume2,
  },
  {
    id: "forum",
    title: "Fórum",
    description: "Crie um espaço para os membros postarem tópicos e conversarem",
    icon: MessagesSquare,
    prefixIcon: MessagesSquare,
  },
];

export function normalizeChannelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .slice(0, 32);
}

export function CreateChannelModal({
  serverId,
  categoryId,
  categoryName,
  nextPosition,
  onClose,
  onCreated,
}: {
  serverId: string;
  categoryId: string | null;
  categoryName: string;
  nextPosition: number;
  onClose: () => void;
  onCreated: (channel: CreatedChannel) => void;
}) {
  const [kind, setKind] = useState<ChannelKind>("text");
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => KIND_OPTIONS.find((k) => k.id === kind)!, [kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = normalizeChannelName(name);
    if (!clean) {
      setError("O canal precisa de um nome.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: insErr } = await supabase
        .from("channels")
        .insert({
          name: clean,
          kind,
          server_id: serverId,
          category_id: categoryId,
          is_private: isPrivate,
          position: nextPosition,
        })
        .select("id, name, server_id, kind, category_id, position, is_private")
        .single();
      if (insErr) {
        // Se der erro de coluna inexistente, tenta sem as colunas novas
        const msg = insErr.message?.toLowerCase() ?? "";
        if (msg.includes("category_id") || msg.includes("position") || msg.includes("is_private") || msg.includes("schema cache")) {
          const { data: data2, error: insErr2 } = await supabase
            .from("channels")
            .insert({
              name: clean,
              kind,
              server_id: serverId,
            })
            .select("id, name, server_id, kind")
            .single();
          if (insErr2) {
            setError(`Erro ao criar canal: ${insErr2.message}`);
            return;
          }
          onCreated({
            ...data2,
            category_id: null,
            position: 0,
            is_private: false,
          } as CreatedChannel);
          return;
        }
        setError(`Erro ao criar canal: ${insErr.message}`);
        return;
      }
      onCreated(data as CreatedChannel);
    } catch (err) {
      setError(`Erro inesperado: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setSubmitting(false);
    }
  }

  const PrefixIcon = selected.prefixIcon;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Criar canal"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-fade-up relative flex max-h-[92dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-lg bg-[#313338] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.9)]"
      >
        {/* Cabeçalho */}
        <div className="px-4 pt-5">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
          <h2 className="text-xl font-bold text-white">Criar canal</h2>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <PrefixIcon className="size-4" />
            <span>em</span>
            <span className="font-medium text-[#dbdee1]">{categoryName.toUpperCase()}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {/* Tipo de canal */}
            <fieldset>
              <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Tipo de canal
              </legend>
              <div className="space-y-2">
                {KIND_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = kind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setKind(opt.id)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-[#4e5058]/60" : "bg-transparent hover:bg-white/[0.04]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-all ${
                          active
                            ? "border-[6px] border-[#5865f2] bg-white"
                            : "border-2 border-[#80858e] bg-transparent"
                        }`}
                      />
                      <Icon className="size-5 shrink-0 text-[#b5bac1]" />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-[#f2f3f5]">
                          {opt.title}
                        </span>
                        <span className="block truncate text-[13px] text-[#b5bac1]">
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Nome do canal */}
            <fieldset>
              <label
                htmlFor="channel-name"
                className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              >
                Nome do canal
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-[#1e1f22] px-3 py-2.5 ring-1 ring-transparent transition-shadow focus-within:ring-2 focus-within:ring-[#5865f2]">
                <PrefixIcon className="size-5 shrink-0 text-[#80858e]" />
                <input
                  id="channel-name"
                  autoFocus
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="novo-canal"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
                />
              </div>
            </fieldset>

            {/* Canal privado */}
            <div className="flex items-center gap-3 rounded-lg px-1 py-1">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px] font-medium text-[#f2f3f5]">
                  <Lock className="size-4 text-[#b5bac1]" />
                  Canal privado
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-[#b5bac1]">
                  Apenas você e os membros que você escolher poderão ver este canal.
                </p>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                aria-label="Canal privado"
                className="data-[state=checked]:bg-[#5865f2]"
              />
            </div>

            {error && <p className="text-[13px] text-[#fa777c]">{error}</p>}
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-4 bg-[#2b2d31] px-4 py-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white transition-colors hover:underline"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-[3px] bg-[#5865f2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Criar canal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

