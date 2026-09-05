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

/**
 * Versão avançada que calcula o status efetivo baseado na atividade.
 * Usa is_online e last_active_at para determinar se o usuário está realmente online.
 */
export function SmartStatusDot({
  status,
  isOnline,
  lastActiveAt,
  ring = "bg-background",
  className,
}: {
  status?: string | null | undefined;
  isOnline?: boolean | null | undefined;
  lastActiveAt?: string | null | undefined;
  ring?: string | undefined;
  className?: string | undefined;
}) {
  const effectiveStatus = getEffectiveStatus(status, isOnline, lastActiveAt);

  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2",
        ring,
        className,
      )}
      style={{ backgroundColor: statusColor(effectiveStatus) }}
    />
  );
}

/**
 * Calcula o status efetivo baseado na última atividade
 */
function getEffectiveStatus(
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

  // Sanity check: heartbeat roda a cada 30s. Se o último sinal é muito antigo
  // (> 24h) mas is_online ficou preso em true (fechou sem beforeunload),
  // considera offline.
  if (lastActiveAt) {
    const lastActive = new Date(lastActiveAt).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (lastActive < oneHourAgo) {
      // Sem interação/heartbeat há mais de 1h -> ausente (ou desconectado
      // abruptamente; ausente é o fallback seguro)
      return "ausente";
    }
  }

  return "online";
}