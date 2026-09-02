-- Cria bucket para armazenamento de banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso para banners
-- Qualquer um pode visualizar banners (são públicos)
CREATE POLICY "Banners são públicos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'banners');

-- Usuários podem fazer upload do próprio banner
CREATE POLICY "Usuários podem fazer upload do próprio banner"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Usuários podem atualizar o próprio banner
CREATE POLICY "Usuários podem atualizar o próprio banner"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Usuários podem deletar o próprio banner
CREATE POLICY "Usuários podem deletar o próprio banner"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);