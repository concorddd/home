ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_name_key;
DROP INDEX IF EXISTS public.channels_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS channels_server_name_key ON public.channels (server_id, name);

DROP POLICY IF EXISTS "Dono edita canais" ON public.channels;
CREATE POLICY "Dono edita canais" ON public.channels
  FOR UPDATE TO authenticated
  USING (public.is_server_owner(server_id, auth.uid()))
  WITH CHECK (public.is_server_owner(server_id, auth.uid()));