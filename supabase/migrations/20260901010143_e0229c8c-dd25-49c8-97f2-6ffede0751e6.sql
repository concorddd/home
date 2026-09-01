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