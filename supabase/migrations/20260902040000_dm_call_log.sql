-- ============================================================
-- Log de chamadas na DM: mensagens com kind='call' registram
-- chamadas perdidas/atendidas e a duração.
-- ============================================================
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
