import { cn } from "@/lib/utils";

/**
 * Mapeia o status de presença do perfil para a cor da bolinha,
 * igual ao Discord.
 *   - online    -> verde
 *   - ausente   -> amarelo/laranja
 *   - ocupado   -> vermelho
 *   - invisível -> cinza
 */
export const STATUS_COLORS: Record<string, string> = {
  online: "#23a55a",
  ausente: "#f0b232",
  ocupado: "#f23f43",
  "não perturbe": "#f23f43",
  "não perturbar": "#f23f43",
  invisível: "#80848e",
  offline: "#80848e",
};

export function statusColor(status: string | null | undefined): string {
  if (!status) return "#23a55a";
  return STATUS_COLORS[status.toLowerCase()] ?? "#23a55a";
}

/**
 * Bolinha de atividade que acompanha o avatar. A cor muda conforme o
 * `status` do usuário (online, ausente, ocupado, invisível).
 *
 * @param status        status do perfil (ex.: "online", "ausente")
 * @param ring          cor do anel ao redor da bolinha (classe tailwind)
 * @param className     classes adicionais (tamanho, posição)
 */
export function StatusDot({
  status,
  ring = "bg-background",
  className,
}: {
  status?: string | null | undefined;
  ring?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2",
        ring,
        className,
      )}
      style={{ backgroundColor: statusColor(status) }}
    />
  );
}