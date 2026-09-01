ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS direct_messages_recipient_read_idx ON public.direct_messages (recipient_id, read);

DROP POLICY IF EXISTS "Destinatario marca DM como lida" ON public.direct_messages;
CREATE POLICY "Destinatario marca DM como lida"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());
