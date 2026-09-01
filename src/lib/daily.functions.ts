import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API = "https://api.daily.co/v1";

async function shortHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function ensureRoom(apiKey: string, name: string) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const existing = await fetch(`${API}/rooms/${name}`, { headers });
  if (existing.ok) return (await existing.json()) as { url: string };

  const created = await fetch(`${API}/rooms`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        enable_screenshare: true,
        enable_chat: false,
        start_video_off: true,
        start_audio_off: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      },
    }),
  });
  if (created.ok) return (await created.json()) as { url: string };

  // corrida: outra pessoa criou a sala no mesmo instante
  const retry = await fetch(`${API}/rooms/${name}`, { headers });
  if (retry.ok) return (await retry.json()) as { url: string };

  throw new Error(`Falha ao criar sala: ${await created.text()}`);
}

async function meetingToken(
  apiKey: string,
  room: string,
  userName: string,
  userId: string,
) {
  const res = await fetch(`${API}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name: room,
        user_name: userName,
        user_id: userId,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
      },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao gerar token: ${await res.text()}`);
  const json = (await res.json()) as { token: string };
  return json.token;
}

export const getChannelCallCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ channelId: z.string().uuid(), name: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["DAILY_API_KEY"];
    if (!apiKey) throw new Error("Daily.co não configurado");

    // RLS garante que o usuário só enxerga canais de servidores dos quais é membro
    const { data: channel, error } = await context.supabase
      .from("channels")
      .select("id")
      .eq("id", data.channelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!channel) throw new Error("Sem acesso a este canal");

    const room = `ch-${await shortHash(data.channelId)}`;
    const { url } = await ensureRoom(apiKey, room);
    const token = await meetingToken(apiKey, room, data.name, context.userId);
    return { url, token };
  });

export const getDmCallCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ peerId: z.string().uuid(), name: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["DAILY_API_KEY"];
    if (!apiKey) throw new Error("Daily.co não configurado");

    const { data: friends, error } = await context.supabase.rpc("are_friends", {
      _a: context.userId,
      _b: data.peerId,
    });
    if (error) throw new Error(error.message);
    if (!friends) throw new Error("Vocês precisam ser amigos para iniciar uma chamada");

    const room = `dm-${await shortHash([context.userId, data.peerId].sort().join("-"))}`;
    const { url } = await ensureRoom(apiKey, room);
    const token = await meetingToken(apiKey, room, data.name, context.userId);
    return { url, token };
  });
