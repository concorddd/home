import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";

/**
 * Login por @username (o nome de usuário escolhido na hora do cadastro).
 *
 * Como o Supabase Auth não expõe login direto por username, esta função
 * server-side:
 *  1. Usa o cliente admin (service role) para localizar o usuário pelo
 *     `username` armazenado em `auth.users.user_metadata`, obtendo seu e-mail
 *     sem expô-lo ao cliente.
 *  2. Faz o sign-in de fato com e-mail + senha usando o cliente anônimo
 *     (publicável) — o mesmo caminho usado pelo login por e-mail.
 *  3. Devolve apenas os tokens de sessão para o cliente aplicar via
 *     `supabase.auth.setSession(...)`.
 *
 * Mensagens de erro são genéricas para username inexistente e senha errada,
 * evitando enumeração de contas.
 */
export const loginByUsername = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        username: z.string().min(1).max(64),
        password: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const clean = data.username.trim().replace(/^@/, "").toLowerCase();
    if (!clean) {
      return { ok: false, error: "Usuário ou senha inválidos." } as const;
    }

    const email = await resolveUserEmail(clean);
    if (!email) {
      return { ok: false, error: "Usuário ou senha inválidos." } as const;
    }

    const anon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: sessionData, error } = await anon.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (error || !sessionData?.session) {
      return { ok: false, error: "Usuário ou senha inválidos." } as const;
    }

    const session = sessionData.session;
    return {
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    } as const;
  });

export type LoginByUsernameResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; error: string };

async function resolveUserEmail(username: string): Promise<string | null> {
  let admin: SupabaseClient<Database>;
  try {
    // Carregado sob demanda dentro do handler para que o cliente service-role
    // (e seu uso de `process.env`) nunca seja incluído no bundle do cliente.
    const mod = await import("@/integrations/supabase/client.server");
    admin = mod.supabaseAdmin;
  } catch (err) {
    console.error("[loginByUsername] cliente admin indisponível:", err);
    return null;
  }

  const perPage = 100;
  try {
    for (let page = 0; page < 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("[loginByUsername] listUsers error:", (error as Error).message);
        return null;
      }
      const users: User[] = data?.users ?? [];
      const match = users.find((u) => {
        const name = u?.user_metadata?.["username"];
        return typeof name === "string" && name.toLowerCase() === username;
      });
      if (match) return match.email ?? null;
      if (users.length < perPage) break;
    }
  } catch (err) {
    // Pode lançar se SUPABASE_SERVICE_ROLE_KEY não estiver configurado.
    console.error("[loginByUsername] listUsers lançou:", (err as Error).message);
    return null;
  }
  return null;
}
