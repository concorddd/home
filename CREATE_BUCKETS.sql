-- ============================================================
-- EXECUTE ESTE SQL NO SUPABASE DASHBOARD (SQL Editor)
-- Projeto: davmtlxhsudgqfhboftr
-- ============================================================

-- Bucket para avatares de usuário
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket para anexos de chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket para banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket para áudio
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket para mídias de servidor
INSERT INTO storage.buckets (id, name, public)
VALUES ('server-media', 'server-media', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Políticas para bucket avatares
-- ============================================================
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

-- ============================================================
-- Políticas para bucket chat-attachments
-- ============================================================
DROP POLICY IF EXISTS "Anexos leitura autenticada" ON storage.objects;
-- ============================================================
-- Políticas para bucket banners (público para leitura)
-- ============================================================
DROP POLICY IF EXISTS "Banners visíveis para todos" ON storage.objects;
CREATE POLICY "Banners visíveis para todos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Usuário envia próprio banner" ON storage.objects;
CREATE POLICY "Usuário envia próprio banner" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuário atualiza próprio banner" ON storage.objects;
CREATE POLICY "Usuário atualiza próprio banner" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Usuário apaga próprio banner" ON storage.objects;
CREATE POLICY "Usuário apaga próprio banner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Políticas para bucket audio
-- ============================================================
DROP POLICY IF EXISTS "Qualquer um pode ler audio" ON storage.objects;
CREATE POLICY "Qualquer um pode ler audio" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'audio');

DROP POLICY IF EXISTS "Usuários autenticados podem enviar audio" ON storage.objects;
CREATE POLICY "Usuários autenticados podem enviar audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio');

-- ============================================================
-- Políticas para bucket server-media
-- ============================================================
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
