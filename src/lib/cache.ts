import { useCallback, useEffect, useState } from "react";

/**
 * Cache simples em memória (por sessão) para deixar a navegação instantânea:
 * a tela mostra imediatamente o último dado conhecido e revalida em background.
 */
const store = new Map<string, unknown>();

export function readCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function writeCache<T>(key: string, value: T) {
  store.set(key, value);
}

export function useCached<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : fallback));

  useEffect(() => {
    setState(store.has(key) ? (store.get(key) as T) : fallback);
    // fallback é intencionalmente ignorado nas deps (valor literal a cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next =
          typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        store.set(key, next);
        return next;
      });
    },
    [key],
  );

  return [state, set, store.has(key)] as const;
}
