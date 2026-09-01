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