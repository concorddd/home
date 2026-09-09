import { useCallback, useEffect, useState } from "react";

/**
 * Cache híbrido: localStorage (persistência) + Map (velocidade).
 * A tela mostra imediatamente o último dado conhecido e revalida em background.
 * SSR-safe: qualquer acesso a localStorage é protegido com typeof + try/catch.
 */
const store = new Map<string, unknown>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function persistKey(key: string) {
  return `concord:cache:${key}`;
}

function loadFromStorage<T>(key: string): T | undefined {
  if (!isBrowser()) return undefined;
  try {
    const raw = localStorage.getItem(persistKey(key));
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function saveToStorage<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(persistKey(key), JSON.stringify(value));
  } catch {
    /* storage indisponível */
  }
}

export function readCache<T>(key: string): T | undefined {
  if (store.has(key)) return store.get(key) as T;
  return loadFromStorage<T>(key);
}

export function writeCache<T>(key: string, value: T) {
  store.set(key, value);
  saveToStorage(key, value);
}

export function useCached<T>(key: string, fallback: T) {
  // SSR-safe: não lê localStorage durante o primeiro render (servidor).
  // A hidratação acontece no useEffect abaixo, só no browser.
  const [state, setState] = useState<T>(fallback);

  useEffect(() => {
    const cached = loadFromStorage<T>(key);
    if (cached !== undefined) {
      store.set(key, cached);
      setState(cached);
    }
    // fallback é intencionalmente ignorado nas deps (valor literal a cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const base = (prev ?? fallback) as T;
        const next =
          typeof value === "function" ? (value as (p: T) => T)(base) : value;
        store.set(key, next);
        saveToStorage(key, next);
        return next;
      });
    },
    [key, fallback],
  );

  return [state, set, store.has(key)] as const;
}
