import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sincronização global em tempo real: qualquer alteração em perfis, servidores,
 * membros, canais ou amizades incrementa a versão, e as telas refazem suas queries.
 */
const SyncContext = createContext(0);

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const channel = supabase
      .channel("global-sync")
      // profiles: apenas INSERT/DELETE disparam sync global.
      // UPDATE não (o heartbeat de presença atualiza profiles a cada 30s e
      // recarregaria todas as telas em cascata).
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, bump)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "servers" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, bump)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return <SyncContext.Provider value={version}>{children}</SyncContext.Provider>;
}

export function useRealtimeSync() {
  return useContext(SyncContext);
}
