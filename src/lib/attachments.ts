import { supabase } from "@/integrations/supabase/client";

export const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024; // 1 GB

export type UploadedAttachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

function sanitize(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);
}

/**
 * Envia um arquivo para o bucket privado `chat-attachments` com progresso real
 * (XHR, pois o SDK não expõe eventos de progresso) e devolve uma URL assinada.
 */
export async function uploadAttachment(
  file: File,
  userId: string,
  onProgress: (percent: number) => void,
): Promise<UploadedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Arquivo maior que o limite de 1GB.");
  }

  const path = `${userId}/${Date.now()}-${sanitize(file.name)}`;
  const baseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/storage/v1/object/chat-attachments/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "true");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Falha no upload (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Falha de rede durante o upload."));
    xhr.send(file);
  });

  const { data, error } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Não foi possível gerar o link.");

  return {
    url: data.signedUrl,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
