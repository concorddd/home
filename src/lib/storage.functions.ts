import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Buckets necessários para o funcionamento do app
const REQUIRED_BUCKETS = [
  "avatars",
  "chat-attachments",
  "banners",
  "audio",
  "server-media",
] as const;

/**
 * Garante que os buckets de storage necessários existam (ex.: "banners").
 *
 * O cliente público não tem permissão de criar buckets — só a chave
 * service role consegue. Esta server function usa o client admin
 * (carregado sob demanda para não vazer service role no bundle) e cria
 * o bucket público caso ainda não exista. É seguro chamar várias vezes.
 */
export const ensureStorageBuckets = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        buckets: z.array(z.string().min(1).max(64)),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: Record<string, string> = {};

    for (const bucketId of data.buckets) {
      try {
        const { data: existing, error: getErr } = await supabaseAdmin.storage.getBucket(bucketId);

        if (getErr && getErr.message?.toLowerCase().includes("not found")) {
          const { error: createErr } = await supabaseAdmin.storage.createBucket(bucketId, {
            public: true,
          });
          if (createErr) {
            results[bucketId] = `erro ao criar: ${createErr.message}`;
            continue;
          }
          results[bucketId] = "criado";
        } else if (getErr) {
          results[bucketId] = `erro ao verificar: ${getErr.message}`;
          continue;
        } else {
          results[bucketId] = existing?.public ? "ok (público)" : "ok (privado)";
        }
      } catch (err) {
        results[bucketId] = `erro: ${(err as Error).message}`;
      }
    }

    return { ok: true, results };
  });

/**
 * Garante que TODOS os buckets necessários para o app existam.
 * Chamada automaticamente ao iniciar o app.
 */
export const ensureAllBuckets = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: Record<string, string> = {};

    for (const bucketId of REQUIRED_BUCKETS) {
      try {
        const { data: existing, error: getErr } = await supabaseAdmin.storage.getBucket(bucketId);

        if (getErr && getErr.message?.toLowerCase().includes("not found")) {
          const { error: createErr } = await supabaseAdmin.storage.createBucket(bucketId, {
            public: true,
          });
          if (createErr) {
            results[bucketId] = `erro ao criar: ${createErr.message}`;
            continue;
          }
          results[bucketId] = "criado";
        } else if (getErr) {
          results[bucketId] = `erro ao verificar: ${getErr.message}`;
          continue;
        } else {
          results[bucketId] = existing?.public ? "ok (público)" : "ok (privado)";
        }
      } catch (err) {
        results[bucketId] = `erro: ${(err as Error).message}`;
      }
    }

    return { ok: true, results };
  });

/** Resultado do ensureStorageBuckets. */
export type EnsureStorageBucketsResult = {
  ok: boolean;
  results: Record<string, string>;
};