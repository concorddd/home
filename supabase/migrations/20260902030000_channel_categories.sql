-- ============================================================
-- Categorias de canais + ordenação (drag & drop) + canais privados
-- ============================================================

-- 1) Tabela de categorias
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

CREATE POLICY "Authenticated users can read channel categories"
  ON public.channel_categories FOR SELECT TO authenticated USING (true);

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

CREATE INDEX channel_categories_server_idx ON public.channel_categories (server_id, position);

-- 2) Novas colunas em channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.channel_categories(id) ON DELETE SET NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- 3) Dono do servidor pode reordenar/renomear/excluir canais
DROP POLICY IF EXISTS "Server owner can update channels" ON public.channels;
DROP POLICY IF EXISTS "Server owner can delete channels" ON public.channels;

GRANT UPDATE, DELETE ON public.channels TO authenticated;

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

CREATE POLICY "Server owner can delete channels"
  ON public.channels FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = channels.server_id AND s.owner_id = auth.uid()
    )
  );

-- 4) Backfill: categoria "Geral" para cada servidor existente + ordena canais
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

-- 5) Novos servidores já nascem com categoria Geral + canal geral ordenado
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
