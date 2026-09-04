-- ============================================================
-- Bio, mensagens de áudio e fixar mensagens
-- ============================================================

-- 1) Adiciona campo bio na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';

-- 2) Adiciona colunas para mensagens de áudio e fixadas
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_duration integer; -- em segundos
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- 3) Índice para mensagens fixadas
CREATE INDEX IF NOT EXISTS messages_pinned_idx ON public.messages (channel_id, is_pinned) WHERE is_pinned = true;

-- 4) Função para fixar/desfixar mensagem
CREATE OR REPLACE FUNCTION public.toggle_pin_message(message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages
  SET is_pinned = NOT is_pinned
  WHERE id = message_id;
END;
$$;

-- 5) Função para deletar mensagem
CREATE OR REPLACE FUNCTION public.delete_message(message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.messages WHERE id = message_id;
END;
$$;

-- 6) Função para limpar conversa (DM)
CREATE OR REPLACE FUNCTION public.clear_conversation(other_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.messages
  WHERE user_id = auth.uid() AND recipient_id = other_user_id
     OR user_id = other_user_id AND recipient_id = auth.uid();
END;
$$;

-- 7) Políticas para as novas funcionalidades
GRANT EXECUTE ON FUNCTION public.toggle_pin_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_conversation TO authenticated;

-- 8) Atualiza políticas de mensagens para permitir delete/update
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 9) Criar bucket para áudio se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- 10) Políticas para bucket de áudio
CREATE POLICY "Anyone can read audio"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'audio');

CREATE POLICY "Authenticated users can upload audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio');
