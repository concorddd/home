import { useEffect, useLayoutEffect, useState } from "react";

const KEY = "concord:tour:v1";

type Step = { selector: string; title: string; text: string };

const STEPS: Step[] = [
  {
    selector: '[data-tour="friends"]',
    title: "Seus amigos",
    text: "Aqui você adiciona amigos por @username, aceita pedidos e abre conversas privadas.",
  },
  {
    selector: '[data-tour="settings"]',
    title: "Configurações",
    text: "Toque na engrenagem para editar seu nome, foto de perfil e sair da conta.",
  },
  {
    selector: '[data-tour="add-server"]',
    title: "Servidores",
    text: "Use o + verde para criar um servidor ou entrar em um com um link de convite.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function GuidedTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* storage indisponível */
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector(STEPS[step]!.selector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const id = window.setTimeout(measure, 150);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [open, step]);

  function finish() {
    try {
      localStorage.setItem(KEY, "done");
    } catch {
      /* storage indisponível */
    }
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step]!;
  const pad = 8;
  const tipTop = rect ? Math.min(rect.top + rect.height + 12, window.innerHeight - 190) : 120;
  const tipLeft = rect ? Math.min(Math.max(rect.left - 8, 16), window.innerWidth - 300) : 24;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/70" onClick={finish} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)",
          }}
        />
      )}
      <div
        className="absolute w-[280px] rounded-xl bg-channels p-4 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.9)]"
        style={{ top: tipTop, left: tipLeft }}
      >
        <p className="text-sm font-semibold">{current.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{current.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {step + 1} de {STEPS.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={finish}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Pular
            </button>
            <button
              onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110"
            >
              {step === STEPS.length - 1 ? "Concluir" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
