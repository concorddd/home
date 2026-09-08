import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

type BlockingContextValue = {
  /** IDs de usuários bloqueados pelo usuário local. */
  blocked: Set<string>;
  isBlocked: (targetId: string) => boolean;
  /** Bloqueia (shadow ban): retorna false se o banco recusar. */
  blockUser: (targetId: string) => Promise<boolean>;
  /** Desbloqueia um usuário. */
  unblockUser: (targetId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

const BlockingContext = createContext<BlockingContextValue | undefined>(undefined);

// A tabela user_blocks ainda não está nos tipos gerados do Supabase, então
// fazemos um cast para um builder "solto" (padrão já usado para is_pinned).
type RowsQuery = {
  eq: (
    k: string,
    v: string,
  ) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
};
type DeleteEq = {
  // delete().eq(k,v) continua encadeável: .delete().eq(blocker).eq(blocked)
  eq: (k: string, v: string) => {
    eq: (k2: string, v2: string) => Promise<{ error: { message: string } | null }>;
  };
};
const blocksDb = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => RowsQuery;
    insert: (o: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    delete: () => DeleteEq;
  };
};

/**
 * Estado global de bloqueio. O Shadow ban funciona em duas camadas:
 * 1. Front-end: mensagens novas de quem foi bloqueado não são renderizadas.
 * 2. Banco (trigger nas migrations): DMs enviadas por quem foi bloqueado não são
 *    salvas (BEFORE INSERT ... RETURN NULL).
 */
export function BlockingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const sync = useRealtimeSync();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setBlocked(new Set());
      return;
    }
    // A tabela pode ainda não existir em bancos antigos (migração pendente):
    // nesse caso tratamos como "ninguém bloqueado" sem quebrar a tela.
    const { data, error } = await blocksDb
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id);
    if (error) return;
    setBlocked(
      new Set((data ?? []).map((row) => String(row["blocked_id"]))),
    );
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh, sync]);

  const blockUser = useCallback(
    async (targetId: string) => {
      if (!user) return false;
      const { error } = await blocksDb
        .from("user_blocks")
        .insert({ blocker_id: user.id, blocked_id: targetId });
      if (error) return false;
      setBlocked((prev) => new Set(prev).add(targetId));
      return true;
    },
    [user],
  );

  const unblockUser = useCallback(
    async (targetId: string) => {
      if (!user) return false;
      const { error } = await blocksDb
        .from("user_blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetId);
      if (error) return false;
      setBlocked((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      return true;
    },
    [user],
  );

  const isBlocked = useCallback((targetId: string) => blocked.has(targetId), [blocked]);

  const value = useMemo(
    () => ({ blocked, isBlocked, blockUser, unblockUser, refresh }),
    [blocked, isBlocked, blockUser, unblockUser, refresh],
  );

  return <BlockingContext.Provider value={value}>{children}</BlockingContext.Provider>;
}

export function useBlocking() {
  const ctx = useContext(BlockingContext);
  if (!ctx) throw new Error("useBlocking deve ser usado dentro de BlockingProvider");
  return ctx;
}