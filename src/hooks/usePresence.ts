import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_INTERVAL = 30_000; // 30 segundos
const ACTIVITY_TIMEOUT = 60 * 60_000; // 1 hora sem interação = ausente

export function usePresence(userId: string | undefined | null) {
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatRef = useRef<number | null>(null);

  // Atualiza a atividade do usuário
  const updateActivity = useCallback(async () => {
    if (!userId) return;
    lastActivityRef.current = Date.now();
    
    try {
      // Atualiza diretamente a tabela profiles
      const update = {
        last_active_at: new Date().toISOString(),
        is_online: true,
      };
      // Usa unknown para contornar tipagem estrita do Supabase
      await (supabase.from("profiles") as unknown as { update: (o: object) => { eq: (k: string, v: string) => Promise<unknown> } })
        .update(update)
        .eq("id", userId);
    } catch {
      /* ignore - coluna pode não existir ainda */
    }
  }, [userId]);

  // Marca como offline ao sair
  const setOffline = useCallback(async () => {
    if (!userId) return;
    
    try {
      const update = {
        is_online: false,
        status: "invisível",
      };
      // Usa unknown para contornar tipagem estrita do Supabase
      await (supabase.from("profiles") as unknown as { update: (o: object) => { eq: (k: string, v: string) => Promise<unknown> } })
        .update(update)
        .eq("id", userId);
    } catch {
      /* ignore - coluna pode não existir ainda */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Marca como online ao montar
    void updateActivity();

    // Configura heartbeat periódico
    heartbeatRef.current = window.setInterval(() => {
      const inactive = Date.now() - lastActivityRef.current;
      
      // Se está inativo há mais que o timeout, não atualiza (será marcado como ausente)
      if (inactive > ACTIVITY_TIMEOUT) return;
      
      void updateActivity();
    }, HEARTBEAT_INTERVAL);

    // Detecta atividade do usuário
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Eventos que indicam atividade
    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Marca offline antes de fechar/aba
    const handleBeforeUnload = () => {
      void setOffline();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Quando a aba volta ao foco, atualiza atividade
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void updateActivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
      }
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // NAO marca offline no unmount: React StrictMode desmonta/remonta em dev
      // e a navegacao remontaria o provider marcando offline erroneamente.
      // O offline real acontece no beforeunload (fechou a aba/janela).
    };
  }, [userId, updateActivity, setOffline]);

  return { updateActivity, setOffline };
}

/**
 * Calcula o status efetivo baseado na última atividade
 */
export function getEffectiveStatus(
  status: string | null | undefined,
  isOnline: boolean | null | undefined,
  lastActiveAt: string | null | undefined
): string {
  // Se está marcado como ocupado ou não perturbe, mantém
  if (status === "ocupado" || status === "não perturbe" || status === "não perturbar") {
    return "ocupado";
  }

  // Se está marcado como invisível/offline, mantém
  if (status === "invisível" || status === "offline") {
    return "invisível";
  }

  // Se não está online no sistema
  if (!isOnline) {
    return "invisível";
  }

  // Se passou mais de 1h sem atividade -> ausente
  if (lastActiveAt) {
    const lastActive = new Date(lastActiveAt).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (lastActive < oneHourAgo) {
      return "ausente";
    }
  }

  return "online";
}
