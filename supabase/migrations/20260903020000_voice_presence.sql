-- ============================================================
-- Tabela de presença em canais de voz
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voice_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_muted boolean NOT NULL DEFAULT false,
  is_deafened boolean NOT NULL DEFAULT false,
  is_speaking boolean NOT NULL DEFAULT false,
  is_screen_sharing boolean NOT NULL DEFAULT false,
  is_camera_on boolean NOT NULL DEFAULT false,
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.voice_presence ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Users can view voice presence"
  ON public.voice_presence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own voice presence"
  ON public.voice_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own voice presence"
  ON public.voice_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own voice presence"
  ON public.voice_presence FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Índice
CREATE INDEX IF NOT EXISTS voice_presence_channel_idx ON public.voice_presence (channel_id);
CREATE INDEX IF NOT EXISTS voice_presence_user_idx ON public.voice_presence (user_id);

-- Habilitar Realtime para voice_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_presence;
