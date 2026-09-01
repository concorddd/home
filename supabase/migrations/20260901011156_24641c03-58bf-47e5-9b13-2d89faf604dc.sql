DROP POLICY IF EXISTS "server media read" ON storage.objects;
DROP POLICY IF EXISTS "server media insert" ON storage.objects;
DROP POLICY IF EXISTS "server media update" ON storage.objects;
DROP POLICY IF EXISTS "server media delete" ON storage.objects;

CREATE POLICY "server media read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'server-media');

CREATE POLICY "server media insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'server-media'
    AND public.is_server_owner(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "server media update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'server-media'
    AND public.is_server_owner(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "server media delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'server-media'
    AND public.is_server_owner(((storage.foldername(name))[1])::uuid, auth.uid())
  );