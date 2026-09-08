import { useCallback, useRef } from "react";

/**
 * Hook de "long press" (pressionar e segurar) — usado no mobile para abrir o
 * menu de ações da mensagem (equivalente ao clique direito do desktop).
 * Dispara apenas após ~500ms segurando, sem disparar em scroll/toque rápido.
 */
export function useLongPress(callback: () => void, ms = 500) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      callback();
    }, ms);
  }, [callback, ms]);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    firedRef.current = false;
  }, [clear]);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: cancel,
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
  };
}

/**
 * Versão em forma de factory para usar dentro de loops (`.map`) sem violar as
 * regras de hooks: retorna os handlers de touch prontos para espalhar num nó.
 */
export function makeLongPressHandlers(callback: () => void, ms = 500) {
  let timer: number | null = null;

  const start = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      callback();
    }, ms);
  };
  const stop = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchMove: stop,
    onTouchCancel: stop,
  };
}