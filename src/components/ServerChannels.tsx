import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  FolderPlus,
  GripVertical,
  Hash,
  Lock,
  MessagesSquare,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  CreateChannelModal,
  type CreatedChannel,
} from "@/components/CreateChannelModal";
import { VoiceChannelPresence } from "@/hooks/useVoicePresence";

export type Channel = {
  id: string;
  name: string;
  server_id: string | null;
  kind: string;
  category_id: string | null;
  position: number;
  is_private: boolean;
};

export type ChannelCategory = {
  id: string;
  name: string;
  position: number;
};

type ChannelIconProps = { channel: Pick<Channel, "kind">; className?: string };

function ChannelKindIcon({ channel, className }: ChannelIconProps) {
  if (channel.kind === "voice") return <Volume2 className={className} />;
  if (channel.kind === "forum") return <MessagesSquare className={className} />;
  return <Hash className={className} />;
}

function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const MUTED_KEY = "mutedChannels";
const HIDE_MUTED_KEY = "hideMutedChannels";

export function ServerChannels({
  serverId,
  currentChannelId,
  isOwner,
  channels,
  setChannels,
  onNavigate,
  onInvite,
  onRenameChannel,
  onDeleteChannel,
  openCreate,
  setOpenCreate,
}: {
  serverId: string | null;
  currentChannelId: string;
  isOwner: boolean;
  channels: Channel[];
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  onNavigate: (channelId: string) => void;
  onInvite: () => void;
  onRenameChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
  openCreate: boolean;
  setOpenCreate: (v: boolean) => void;
}) {
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState<string[]>(() => readStringArray(MUTED_KEY));
  const [hideMuted, setHideMuted] = useState(() => readBool(HIDE_MUTED_KEY, false));
  const [error, setError] = useState<string | null>(null);
  const [categoriesEnabled, setCategoriesEnabled] = useState(true);

  const [emptyMenu, setEmptyMenu] = useState<{ x: number; y: number; categoryId: string | null } | null>(null);
  const [channelMenu, setChannelMenu] = useState<{ x: number; y: number; channelId: string } | null>(null);
  const [createTarget, setCreateTarget] = useState<{ categoryId: string | null } | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ---- categorias: carregar + realtime ----
  useEffect(() => {
    if (!serverId) return;
    void (async () => {
      const { data, error: catErr } = await supabase
        .from("channel_categories")
        .select("id, name, position")
        .eq("server_id", serverId)
        .order("position", { ascending: true });
      if (catErr) {
        // migration ainda não aplicada — desabilita categorias
        setCategoriesEnabled(false);
        setCategories([]);
      } else {
        setCategories((data as ChannelCategory[]) ?? []);
      }
    })();
    const sub = supabase
      .channel(`channel_categories:${serverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_categories", filter: `server_id=eq.${serverId}` },
        () => {
          void (async () => {
            const { data, error: catErr } = await supabase
              .from("channel_categories")
              .select("id, name, position")
              .eq("server_id", serverId)
              .order("position", { ascending: true });
            if (catErr) {
              setCategoriesEnabled(false);
              setCategories([]);
            } else {
              setCategories((data as ChannelCategory[]) ?? []);
            }
          })();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [serverId]);

  const toggleCollapse = useCallback((categoryId: string) => {
    setCollapsed((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  }, []);

  const toggleMute = useCallback((channelId: string) => {
    setMuted((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const changeHideMuted = useCallback((value: boolean) => {
    setHideMuted(value);
    try {
      localStorage.setItem(HIDE_MUTED_KEY, value ? "1" : "0");
    } catch {}
  }, []);

  // ---- grupos (categoria -> canais) com filtro de silenciados ----
  const groups = useMemo(() => {
    const visible = hideMuted ? channels.filter((c) => !muted.includes(c.id)) : channels;
    const sortedCats = [...categories].sort((a, b) => a.position - b.position);
    const list: { id: string; name: string; channels: Channel[] }[] = sortedCats.map((c) => ({
      id: c.id,
      name: c.name,
      channels: [],
    }));
    const orphans: Channel[] = [];
    for (const ch of visible) {
      const idx = ch.category_id ? list.findIndex((g) => g.id === ch.category_id) : -1;
      const bucket = idx >= 0 ? list[idx] : undefined;
      if (bucket) bucket.channels.push(ch);
      else orphans.push(ch);
    }
    list.forEach((g) => g.channels.sort((a, b) => a.position - b.position));
    orphans.sort((a, b) => a.position - b.position);
    if (orphans.length) list.push({ id: "__sem_categoria__", name: "Sem categoria", channels: orphans });
    return list;
  }, [categories, channels, hideMuted, muted]);

  const activeChannel = activeId ? channels.find((c) => c.id === activeId) ?? null : null;

  // ---- drag & drop ----
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);
      const activeCh = channels.find((c) => c.id === activeIdStr);
      if (!activeCh) return;
      const overCh = channels.find((c) => c.id === overIdStr);
      const targetCategoryId = overCh
        ? overCh.category_id
        : overIdStr === "__sem_categoria__"
          ? null
          : overIdStr;
      if ((targetCategoryId ?? null) === (activeCh.category_id ?? null)) return;
      setChannels((prev) =>
        prev.map((c) =>
          c.id === activeIdStr ? { ...c, category_id: targetCategoryId ?? null } : c,
        ),
      );
    },
    [channels, setChannels],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || !isOwner) return;
      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);
      const activeCh = channels.find((c) => c.id === activeIdStr);
      if (!activeCh) return;
      const overCh = channels.find((c) => c.id === overIdStr);

      const targetGroupId = overCh
        ? (overCh.category_id ?? "__sem_categoria__")
        : overIdStr === "__sem_categoria__"
          ? "__sem_categoria__"
          : overIdStr;

      const groupChannels = channels
        .filter((c) => (c.category_id ?? "__sem_categoria__") === targetGroupId && c.id !== activeIdStr)
        .sort((a, b) => a.position - b.position);
      let targetIndex = groupChannels.length;
      if (overCh && (overCh.category_id ?? "__sem_categoria__") === targetGroupId) {
        targetIndex = groupChannels.findIndex((c) => c.id === overIdStr);
        if (targetIndex < 0) targetIndex = groupChannels.length;
      }

      // Posições finais do grupo de destino...
      const destIds = [
        ...groupChannels.slice(0, targetIndex).map((c) => c.id),
        activeIdStr,
        ...groupChannels.slice(targetIndex).map((c) => c.id),
      ];
      const updated: Channel[] = [];
      destIds.forEach((id, index) => {
        const ch = channels.find((c) => c.id === id);
        if (!ch) return;
        updated.push({
          ...ch,
          category_id: targetGroupId === "__sem_categoria__" ? null : targetGroupId,
          position: index,
        });
      });
      // ...e recompacta o grupo de origem quando o canal mudou de categoria.
      const sourceGroupId = activeCh.category_id ?? "__sem_categoria__";
      if (sourceGroupId !== targetGroupId) {
        channels
          .filter((c) => (c.category_id ?? "__sem_categoria__") === sourceGroupId && c.id !== activeIdStr)
          .sort((a, b) => a.position - b.position)
          .forEach((c, index) => updated.push({ ...c, position: index }));
      }

      setChannels((prev) => prev.map((c) => updated.find((x) => x.id === c.id) ?? c));

      const changed = updated.filter((u) => {
        const before = channels.find((c) => c.id === u.id);
        if (!before) return false;
        return (
          before.position !== u.position ||
          (before.category_id ?? null) !== (u.category_id ?? null)
        );
      });
      if (!changed.length) return;
      void (async () => {
        const results = await Promise.allSettled(
          changed.map((c) =>
            supabase
              .from("channels")
              .update({ position: c.position, category_id: c.category_id })
              .eq("id", c.id),
          ),
        );
        if (results.some((r) => r.status === "rejected")) {
          setError("Não foi possível salvar a nova ordem dos canais.");
        }
      })();
    },
    [channels, isOwner, setChannels],
  );

  // ---- criar categoria ----
  async function handleCreateCategory() {
    if (!serverId || !categoriesEnabled) return;
    const nextPos = categories.reduce((max, c) => Math.max(max, c.position + 1), 0);
    const { data, error: insErr } = await supabase
      .from("channel_categories")
      .insert({ server_id: serverId, name: "Nova categoria", position: nextPos })
      .select("id, name, position")
      .single();
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setCategories((prev) => [...prev, data as ChannelCategory]);
  }

  // ---- menu de contexto: abrir em área vazia ----
  function handleEmptyContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-channel-item]")) return;
    e.preventDefault();
    const categoryId =
      target.closest("[data-category-id]")?.getAttribute("data-category-id") ?? null;
    setEmptyMenu({ x: e.clientX, y: e.clientY, categoryId });
  }

  // ---- modal: alvo padrão do botão "+" do cabeçalho ----
  useEffect(() => {
    if (!openCreate) return;
    const firstCat = [...categories].sort((a, b) => a.position - b.position)[0];
    setCreateTarget({ categoryId: firstCat?.id ?? null });
    setOpenCreate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreate]);

  function handleCreated(channel: CreatedChannel) {
    setChannels((prev) => [...prev, channel as Channel]);
    setCreateTarget(null);
    onNavigate(channel.id);
  }

  const createGroup = createTarget
    ? groups.find((g) => g.id === (createTarget.categoryId ?? "__sem_categoria__")) ?? groups[0]
    : null;
  const createCategoryName = createTarget
    ? (categories.find((c) => c.id === createTarget.categoryId)?.name ?? "Geral")
    : "Geral";
  const createNextPosition = createGroup
    ? createGroup.channels.reduce((max, c) => Math.max(max, c.position + 1), 0)
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <p className="px-3 pb-1 text-xs text-destructive">{error}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
          onContextMenu={handleEmptyContextMenu}
        >
          {groups.map((group) => (
            <CategorySection
              key={group.id}
              groupId={group.id}
              name={group.name}
              isOwner={isOwner}
              collapsed={group.id !== "__sem_categoria__" ? Boolean(collapsed[group.id]) : false}
              onToggleCollapse={() => toggleCollapse(group.id)}
              onCreateChannel={() =>
                setCreateTarget({ categoryId: group.id === "__sem_categoria__" ? null : group.id })
              }
            >
              <SortableContext
                items={group.channels.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {group.channels.map((ch) => (
                  <>
                    <SortableChannelItem
                      key={ch.id}
                      channel={ch}
                      active={ch.id === currentChannelId}
                      muted={muted.includes(ch.id)}
                      isOwner={isOwner}
                      dragging={activeId === ch.id}
                      onOpen={() => onNavigate(ch.id)}
                      onRename={() => onRenameChannel(ch)}
                      onDelete={() => onDeleteChannel(ch)}
                      onToggleMute={() => toggleMute(ch.id)}
                      onContextMenu={(x, y) => setChannelMenu({ x, y, channelId: ch.id })}
                    />
                    {ch.kind === "voice" && (
                      <VoiceChannelPresence
                        channelId={ch.id}
                        channelName={ch.name}
                        compact
                      />
                    )}
                  </>
                ))}
              </SortableContext>
            </CategorySection>
          ))}
          {groups.length === 0 && (
            <p className="px-2 py-6 text-xs leading-relaxed text-muted-foreground">
              Nenhum canal ainda. Clique com o botão direito para criar o primeiro.
            </p>
          )}
        </div>
        <DragOverlay>
          {activeChannel ? (
            <div className="cursor-grabbing rounded-lg bg-[#404249] px-2 py-2 shadow-xl ring-1 ring-white/10">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <ChannelKindIcon channel={activeChannel} className="size-4 shrink-0" />
                <span className="truncate tracking-tight">{activeChannel.name}</span>
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {emptyMenu && (
        <ContextMenu
          x={emptyMenu.x}
          y={emptyMenu.y}
          onClose={() => setEmptyMenu(null)}
          items={[
            {
              label: "Ocultar canais silenciados",
              checkbox: hideMuted,
              noHoverStyle: true,
              onSelect: () => changeHideMuted(!hideMuted),
            },
            { separator: true },
            {
              label: "Criar canal",
              icon: <Plus className="size-4" />,
              onSelect: () => setCreateTarget({ categoryId: emptyMenu.categoryId }),
            },
            ...(categoriesEnabled
              ? [
                  {
                    label: "Criar categoria" as const,
                    icon: <FolderPlus className="size-4" />,
                    onSelect: () => void handleCreateCategory(),
                  },
                ]
              : []),
            {
              label: "Convidar para o servidor",
              icon: <UserPlus className="size-4" />,
              onSelect: onInvite,
            },
          ]}
        />
      )}

      {channelMenu &&
        (() => {
          const ch = channels.find((c) => c.id === channelMenu.channelId);
          if (!ch) return null;
          return (
            <ContextMenu
              x={channelMenu.x}
              y={channelMenu.y}
              onClose={() => setChannelMenu(null)}
              items={[
                {
                  label: muted.includes(ch.id) ? "Ativar som do canal" : "Silenciar canal",
                  icon:
                    muted.includes(ch.id) ? (
                      <Volume2 className="size-4" />
                    ) : (
                      <VolumeX className="size-4" />
                    ),
                  onSelect: () => toggleMute(ch.id),
                },
                ...(isOwner
                  ? ([
                      { separator: true },
                      {
                        label: "Renomear canal",
                        icon: <Pencil className="size-4" />,
                        onSelect: () => onRenameChannel(ch),
                      },
                      {
                        label: "Excluir canal",
                        icon: <Trash2 className="size-4" />,
                        danger: true,
                        onSelect: () => onDeleteChannel(ch),
                      },
                    ] as MenuItem[])
                  : []),
              ]}
            />
          );
        })()}

      {createTarget && serverId && (
        <CreateChannelModal
          serverId={serverId}
          categoryId={createTarget.categoryId}
          categoryName={createCategoryName}
          nextPosition={createNextPosition}
          onClose={() => setCreateTarget(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      icon?: React.ReactNode;
      checkbox?: boolean;
      danger?: boolean;
      noHoverStyle?: boolean;
      onSelect: () => void;
    };

/**
 * Menu de contexto customizado, posicionado no cursor (estilo Discord):
 * fundo #111214, cantos arredondados, sombra suave, hover azul #5865f2.
 */
function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      onClose();
    };
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: pos.x, top: pos.y }}
      className="animate-fade-up fixed z-[80] min-w-[224px] rounded-lg bg-[#111214] py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.06]"
    >
      {items.map((item, i) =>
        "separator" in item && item.separator ? (
          <div key={`sep-${i}`} className="mx-2 my-1 h-px bg-[#3f4147]" />
        ) : (
          <button
            key={`item-${i}`}
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[14px] transition-colors",
              item.noHoverStyle
                ? "text-[#b5bac1] hover:text-white"
                : item.danger
                  ? "text-[#f2f3f5] hover:bg-[#da373c] hover:text-white"
                  : "text-[#b5bac1] hover:bg-[#5865f2] hover:text-white",
            )}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {typeof item.checkbox === "boolean" && (
              <span
                aria-hidden
                className={cn(
                  "flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 border-[#80858e]",
                  item.checkbox && "border-[#5865f2] bg-[#5865f2]",
                )}
              >
                {item.checkbox && <Check className="size-3 text-white" />}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

function CategorySection({
  groupId,
  name,
  isOwner,
  collapsed,
  onToggleCollapse,
  onCreateChannel,
  children,
}: {
  groupId: string;
  name: string | null;
  isOwner: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCreateChannel: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId });
  return (
    <section
      data-category-id={groupId === "__sem_categoria__" ? undefined : groupId}
      className="mb-4 last:mb-1"
    >
      {name !== null && (
        <div className="group/cat flex items-center gap-0.5 px-1 pb-1 pt-2">
          <button
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-0.5 text-left"
          >
            <ChevronDown
              className={cn(
                "size-3 shrink-0 text-[#949ba4] transition-transform",
                collapsed && "-rotate-90",
              )}
            />
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.02em] text-[#949ba4] transition-colors hover:text-[#dbdee1]">
              {name}
            </span>
          </button>
          {isOwner && (
            <button
              onClick={onCreateChannel}
              aria-label={`Criar canal em ${name}`}
              title="Criar canal"
              className="rounded p-0.5 text-[#949ba4] opacity-0 transition-opacity hover:text-[#dbdee1] focus-visible:opacity-100 group-hover/cat:opacity-100"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "transition-colors",
          isOver && "rounded-lg bg-white/[0.04] ring-1 ring-[#5865f2]/50",
          collapsed && "min-h-1.5",
        )}
      >
        <div className={collapsed ? "hidden" : undefined}>{children}</div>
      </div>
    </section>
  );
}

function SortableChannelItem({
  channel,
  active,
  muted,
  isOwner,
  dragging,
  onOpen,
  onRename,
  onDelete,
  onToggleMute,
  onContextMenu,
}: {
  channel: Channel;
  active: boolean;
  muted: boolean;
  isOwner: boolean;
  dragging: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleMute: () => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: channel.id,
    disabled: !isOwner,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-channel-item
      className={cn(
        "group/item relative touch-none",
        dragging && "opacity-40",
        isDragging && "z-10",
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      {...attributes}
      {...listeners}
    >
      <button
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-all duration-200",
          active
            ? "bg-accent text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        {isOwner && (
          <GripVertical className="size-3.5 shrink-0 -ml-1 cursor-grab text-muted-foreground/0 transition-colors group-hover/item:text-muted-foreground/70" />
        )}
        <ChannelKindIcon
          channel={channel}
          className={cn("size-4 shrink-0", active && "text-primary")}
        />
        <span className={cn("min-w-0 truncate tracking-tight", muted && "opacity-60")}>
          {channel.name}
        </span>
        {channel.is_private && (
          <Lock className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {isOwner && (
        <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover/item:flex">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            aria-label={`Editar canal ${channel.name}`}
            title="Editar nome"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Apagar canal ${channel.name}`}
            title="Apagar canal"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}


