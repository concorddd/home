-- ============================================================
-- CORREÇÃO COMPLETA DO SCHEMA — CONCORD
-- PODE RODAR QUANTAS VEZES PRECISAR (é idempotente)
-- Execute no Lovable: More → Cloud → Database → SQL queries
-- ============================================================

-- 1) PROFILES — colunas em falta
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.banner_url IS 'URL da imagem de banner do perfil do usuário';

CREATE INDEX IF NOT EXISTS profiles_presence_idx ON public.profiles (is_online, last_active_at);

-- 2) FUNÇÕES DE PRESENÇA
CREATE OR REPLACE FUNCTION public.update_user_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now(),
      is_online = true
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_offline()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = false,
      status = 'invisível'
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_status(new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET status = new_status,
      last_active_at = now(),
      is_online = (new_status = 'online')
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_effective_status(user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_profile profiles%ROWTYPE;
  effective_status text;
BEGIN
  SELECT * INTO user_profile FROM public.profiles WHERE id = user_id;
  IF user_profile IS NULL THEN
    RETURN 'invisível';
  END IF;
  IF user_profile.status IN ('ocupado', 'não perturbe', 'não perturbar') THEN
    RETURN user_profile.status;
  END IF;
  IF user_profile.status IN ('invisível', 'offline') THEN
    RETURN user_profile.status;
  END IF;
  IF NOT user_profile.is_online THEN
    RETURN 'invisível';
  END IF;
  IF user_profile.last_active_at < now() - interval '1 hour' THEN
    RETURN 'ausente';
  END IF;
  RETURN 'online';
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_offline TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_effective_status TO authenticated;
-- 3) MESSAGES — colunas de áudio/fixadas e funções de moderação
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_duration integer;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS messages_pinned_idx ON public.messages (channel_id, is_pinned) WHERE is_pinned = true;

CREATE OR REPLACE FUNCTION public.toggle_pin_message(message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.messages
  SET is_pinned = NOT is_pinned
  WHERE id = message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_message(message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.messages WHERE id = message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_conversation(other_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.messages
  WHERE user_id = auth.uid() AND recipient_id = other_user_id
     OR user_id = other_user_id AND recipient_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_pin_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_conversation TO authenticated;

DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4) DIRECT_MESSAGES — colunas em falta
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';

CREATE INDEX IF NOT EXISTS direct_messages_recipient_read_idx ON public.direct_messages (recipient_id, read);

DROP POLICY IF EXISTS "Destinatario marca DM como lida" ON public.direct_messages;
CREATE POLICY "Destinatario marca DM como lida"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());
-- 5) CHANNEL_CATEGORIES — tabela para categorias/ordenação de canais
CREATE TABLE IF NOT EXISTS public.channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) >= 1 AND length(name) <= 32),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.channel_categories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_categories TO authenticated;
GRANT ALL ON public.channel_categories TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read channel categories" ON public.channel_categories;
CREATE POLICY "Authenticated users can read channel categories"
  ON public.channel_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Server members can manage channel categories" ON public.channel_categories;
CREATE POLICY "Server members can manage channel categories"
  ON public.channel_categories FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.server_members m
      WHERE m.server_id = channel_categories.server_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.server_members m
      WHERE m.server_id = channel_categories.server_id AND m.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS channel_categories_server_idx ON public.channel_categories (server_id, position);

-- 6) CHANNELS — novas colunas + políticas do dono
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
DO $$ BEGIN
  ALTER TABLE public.channels ADD CONSTRAINT channels_kind_check CHECK (kind IN ('text','voice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.channel_categories(id) ON DELETE SET NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

GRANT UPDATE, DELETE ON public.channels TO authenticated;

DROP POLICY IF EXISTS "Server owner can update channels" ON public.channels;
CREATE POLICY "Server owner can update channels"
  ON public.channels FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = channels.server_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = channels.server_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owner can delete channels" ON public.channels;
CREATE POLICY "Server owner can delete channels"
  ON public.channels FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = channels.server_id AND s.owner_id = auth.uid()
    )
  );

-- Backfill: categoria "Geral" para cada servidor + ordena canais
INSERT INTO public.channel_categories (server_id, name, position)
SELECT c.server_id, 'Geral', 0
FROM (SELECT DISTINCT server_id FROM public.channels WHERE server_id IS NOT NULL) c
WHERE NOT EXISTS (
  SELECT 1 FROM public.channel_categories cc
  WHERE cc.server_id = c.server_id AND lower(cc.name) = 'geral'
);

UPDATE public.channels ch
SET category_id = cc.id,
    position = x.rn - 1
FROM (
  SELECT id, server_id, row_number() OVER (PARTITION BY server_id ORDER BY created_at) AS rn
  FROM public.channels
  WHERE server_id IS NOT NULL
) x
JOIN public.channel_categories cc
  ON cc.server_id = x.server_id AND lower(cc.name) = 'geral'
WHERE ch.id = x.id AND ch.category_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_server(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE srv uuid;
        cat uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  INSERT INTO public.servers (name, owner_id) VALUES (trim(_name), auth.uid()) RETURNING id INTO srv;
  INSERT INTO public.server_members (server_id, user_id, role) VALUES (srv, auth.uid(), 'owner');
  INSERT INTO public.channel_categories (server_id, name, position) VALUES (srv, 'Geral', 0) RETURNING id INTO cat;
  INSERT INTO public.channels (name, server_id, category_id, position) VALUES ('geral', srv, cat, 0);
  RETURN srv;
END $$;
-- 7) VOICE_PRESENCE — presença em canais de voz
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

DROP POLICY IF EXISTS "Users can view voice presence" ON public.voice_presence;
CREATE POLICY "Users can view voice presence"
  ON public.voice_presence FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own voice presence" ON public.voice_presence;
CREATE POLICY "Users can insert own voice presence"
  ON public.voice_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own voice presence" ON public.voice_presence;
CREATE POLICY "Users can update own voice presence"
  ON public.voice_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own voice presence" ON public.voice_presence;
CREATE POLICY "Users can delete own voice presence"
  ON public.voice_presence FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS voice_presence_channel_idx ON public.voice_presence (channel_id);
CREATE INDEX IF NOT EXISTS voice_presence_user_idx ON public.voice_presence (user_id);
-- 8) STORAGE BUCKETS — cria todos os buckets que o app usa
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('server-media', 'server-media', true) ON CONFLICT (id) DO NOTHING;

-- --- Políticas para avatares ---
DROP POLICY IF EXISTS "Avatares visíveis para logados" ON storage.objects;
CREATE POLICY "Avatares visíveis para logados" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Usuário envia próprio avatar" ON storage.objects;
CREATE POLICY "Usuário envia próprio avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuário atualiza próprio avatar" ON storage.objects;
CREATE POLICY "Usuário atualiza próprio avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuário apaga próprio avatar" ON storage.objects;
CREATE POLICY "Usuário apaga próprio avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- --- Políticas para chat-attachments ---
DROP POLICY IF EXISTS "Anexos leitura autenticada" ON storage.objects;
CREATE POLICY "Anexos leitura autenticada" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Anexos upload proprio" ON storage.objects;
CREATE POLICY "Anexos upload proprio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anexos update proprio" ON storage.objects;
CREATE POLICY "Anexos update proprio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anexos delete proprio" ON storage.objects;
CREATE POLICY "Anexos delete proprio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- --- Políticas para banners (público) ---
DROP POLICY IF EXISTS "Banners são públicos" ON storage.objects;
DROP POLICY IF EXISTS "Banners visíveis para todos" ON storage.objects;
CREATE POLICY "Banners visíveis para todos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Usuários podem fazer upload do próprio banner" ON storage.objects;
DROP POLICY IF EXISTS "Usuário envia próprio banner" ON storage.objects;
CREATE POLICY "Usuário envia próprio banner" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuários podem atualizar o próprio banner" ON storage.objects;
DROP POLICY IF EXISTS "Usuário atualiza próprio banner" ON storage.objects;
CREATE POLICY "Usuário atualiza próprio banner" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuários podem deletar o próprio banner" ON storage.objects;
DROP POLICY IF EXISTS "Usuário apaga próprio banner" ON storage.objects;
CREATE POLICY "Usuário apaga próprio banner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- --- Políticas para audio (público) ---
DROP POLICY IF EXISTS "Qualquer um pode ler audio" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read audio" ON storage.objects;
CREATE POLICY "Qualquer um pode ler audio" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'audio');

DROP POLICY IF EXISTS "Usuários autenticados podem enviar audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
CREATE POLICY "Usuários autenticados podem enviar audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio');

-- --- Políticas para server-media ---
DROP POLICY IF EXISTS "Mídia de servidor visível para logados" ON storage.objects;
CREATE POLICY "Mídia de servidor visível para logados" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'server-media');

DROP POLICY IF EXISTS "Usuário envia mídia de servidor" ON storage.objects;
CREATE POLICY "Usuário envia mídia de servidor" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'server-media');

DROP POLICY IF EXISTS "Usuário atualiza mídia de servidor" ON storage.objects;
CREATE POLICY "Usuário atualiza mídia de servidor" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'server-media')
  WITH CHECK (bucket_id = 'server-media');

DROP POLICY IF EXISTS "Usuário apaga mídia de servidor" ON storage.objects;
CREATE POLICY "Usuário apaga mídia de servidor" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'server-media');
-- 9) REALTIME — garante que todas as tabelas estejam na publicação
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.servers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.channels; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_presence; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
-- ============================================================
-- Cor dinâmica do banner do perfil (customização por usuário)
-- O front injeta via inline style: banner_color || '#11a0f4'
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_color text;

-- ============================================================
-- SISTEMA DE BLOQUEIO (user_blocks) — bloqueio + shadow ban
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê seus bloqueios" ON public.user_blocks;
CREATE POLICY "Usuário vê seus bloqueios" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Usuário cria seus bloqueios" ON public.user_blocks;
CREATE POLICY "Usuário cria seus bloqueios" ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Usuário remove seus bloqueios" ON public.user_blocks;
CREATE POLICY "Usuário remove seus bloqueios" ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

ALTER TABLE public.user_blocks REPLICA IDENTITY FULL;

-- Shadow ban de DM: se o destinatário bloqueou o remetente, a mensagem NÃO é
-- salva (RETURN NULL descarta silenciosamente). O bloqueado continua vendo o
-- chat normalmente e "envia", mas nada chega ao destinatário nem fica no banco.
CREATE OR REPLACE FUNCTION public.prevent_dm_to_blocker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_id = NEW.recipient_id
      AND blocked_id = NEW.sender_id
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_shadow_ban ON public.direct_messages;
CREATE TRIGGER trg_dm_shadow_ban
  BEFORE INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_dm_to_blocker();

-- Realtime: mudanças em user_blocks disparam o sync global (o front reconsulta).
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
