/**
 * Seletor de tela/janela nativo (Tauri).
 *
 * No desktop (Tauri) lista monitores e janelas via backend Rust.
 * No web fallback usa navigator.mediaDevices.getDisplayMedia.
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MonitorUp, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";

type Source = {
  id: string;
  name: string;
  thumbnail?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onStart: (sourceId: string) => void;
};

// Detecta ambiente Tauri nativo
const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

async function listSources(): Promise<Source[]> {
  if (isTauri) {
    // @ts-expect-error - comando Tauri customizado
    const win = await window.__TAURI__.core.invoke("list_sources");
    return (win as Array<{ id: string; name: string; thumbnail?: string }>) ?? [];
  }
  // Web fallback não lista fontes (o browser mostra o picker nativo depois)
  return [{ id: "browser", name: "Selecionar no navegador" }];
}

export function ScreenSharePicker({ open, onClose, onStart }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      try {
        setSources(await listSources());
      } catch {
        setSources([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <h3 className="text-lg font-semibold">Compartilhar tela</h3>
        {loading && <p className="text-sm text-muted-foreground">Carregando fontes...</p>}
        {!loading && sources.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fonte disponível.</p>}
        <div className="grid gap-2">
          {sources.map((s) => (
            <Button key={s.id} variant="outline" onClick={() => onStart(s.id)}>
              <MonitorUp className="mr-2 h-4 w-4" />
              {s.name}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      </DialogContent>
    </Dialog>
  );
}
