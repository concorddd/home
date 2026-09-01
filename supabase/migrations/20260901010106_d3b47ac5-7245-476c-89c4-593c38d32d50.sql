-- ============ SERVERS ============
CREATE TABLE IF NOT EXISTS public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  icon_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE;

-- Servidor inicial para canais órfãos, se houver algum usuário
DO $$
DECLARE first_user uuid; srv uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.channels WHERE server_id IS NULL) THEN
    SELECT id INTO first_user FROM auth.users ORDER BY created_at LIMIT 1;
    IF first_user IS NOT NULL THEN
      INSERT INTO public.servers (name, owner_id) VALUES ('Concord', first_user) RETURNING id INTO srv;
      INSERT INTO public.server_members (server_id, user_id, role) VALUES (srv, first_user, 'owner')
        ON CONFLICT DO NOTHING;
      UPDATE public.channels SET server_id = srv WHERE server_id IS NULL;
    ELSE
      DELETE FROM public.messages;
      DELETE FROM public.channels WHERE server_id IS NULL;
    END IF;
  END IF;
END $$;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_access_channel(_channel_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.server_members m ON m.server_id = c.server_id
    WHERE c.id = _channel_id AND m.user_id = _user_id
  );
$$;

-- Cria servidor + membro dono + canal geral
CREATE OR REPLACE FUNCTION public.create_server(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE srv uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  INSERT INTO public.servers (name, owner_id) VALUES (trim(_name), auth.uid()) RETURNING id INTO srv;
  INSERT INTO public.server_members (server_id, user_id, role) VALUES (srv, auth.uid(), 'owner');
  INSERT INTO public.channels (name, server_id) VALUES ('geral', srv);
  RETURN srv;
END $$;

-- Entrar por convite
CREATE OR REPLACE FUNCTION public.join_server_by_invite(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE srv uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT server_id INTO srv FROM public.invites
   WHERE code = _code AND (expires_at IS NULL OR expires_at > now());
  IF srv IS NULL THEN RAISE EXCEPTION 'Convite inválido ou expirado'; END IF;
  INSERT INTO public.server_members (server_id, user_id) VALUES (srv, auth.uid())
    ON CONFLICT (server_id, user_id) DO NOTHING;
  RETURN srv;
END $$;

CREATE OR REPLACE FUNCTION public.invite_preview(_code text)
RETURNS TABLE (server_id uuid, server_name text, icon_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.icon_url FROM public.invites i
  JOIN public.servers s ON s.id = i.server_id
  WHERE i.code = _code AND (i.expires_at IS NULL OR i.expires_at > now());
$$;

REVOKE EXECUTE ON FUNCTION public.is_server_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_server_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_channel(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_server(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_server_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_server(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_preview(text) TO authenticated;

-- ============ GRANTS (faltavam!) ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_members TO authenticated;
GRANT ALL ON public.server_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

-- ============ RLS ============
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem seus servidores" ON public.servers;
CREATE POLICY "Membros veem seus servidores" ON public.servers FOR SELECT TO authenticated
  USING (public.is_server_member(id, auth.uid()));
DROP POLICY IF EXISTS "Dono atualiza servidor" ON public.servers;
CREATE POLICY "Dono atualiza servidor" ON public.servers FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "Dono apaga servidor" ON public.servers;
CREATE POLICY "Dono apaga servidor" ON public.servers FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Ver membros dos meus servidores" ON public.server_members;
CREATE POLICY "Ver membros dos meus servidores" ON public.server_members FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
DROP POLICY IF EXISTS "Sair do servidor" ON public.server_members;
CREATE POLICY "Sair do servidor" ON public.server_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_server_owner(server_id, auth.uid()));

DROP POLICY IF EXISTS "Ver convites do servidor" ON public.invites;
CREATE POLICY "Ver convites do servidor" ON public.invites FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
DROP POLICY IF EXISTS "Membros criam convites" ON public.invites;
CREATE POLICY "Membros criam convites" ON public.invites FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_server_member(server_id, auth.uid()));
DROP POLICY IF EXISTS "Dono apaga convites" ON public.invites;
CREATE POLICY "Dono apaga convites" ON public.invites FOR DELETE TO authenticated
  USING (public.is_server_owner(server_id, auth.uid()));

-- Canais: escopo por servidor
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can create channels" ON public.channels;
DROP POLICY IF EXISTS "Channels are public" ON public.channels;
DROP POLICY IF EXISTS "Authenticated users can read channels" ON public.channels;
DROP POLICY IF EXISTS "Membros veem canais" ON public.channels;
CREATE POLICY "Membros veem canais" ON public.channels FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
DROP POLICY IF EXISTS "Dono cria canais" ON public.channels;
CREATE POLICY "Dono cria canais" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_server_owner(server_id, auth.uid()));
DROP POLICY IF EXISTS "Dono apaga canais" ON public.channels;
CREATE POLICY "Dono apaga canais" ON public.channels FOR DELETE TO authenticated
  USING (public.is_server_owner(server_id, auth.uid()));

-- Mensagens: só membros
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can post messages" ON public.messages;
DROP POLICY IF EXISTS "Messages are public" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
DROP POLICY IF EXISTS "Membros leem mensagens" ON public.messages;
CREATE POLICY "Membros leem mensagens" ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_channel(channel_id, auth.uid()));
DROP POLICY IF EXISTS "Membros enviam mensagens" ON public.messages;
CREATE POLICY "Membros enviam mensagens" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_channel(channel_id, auth.uid()));
DROP POLICY IF EXISTS "Autor apaga mensagem" ON public.messages;
CREATE POLICY "Autor apaga mensagem" ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Perfis
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários autenticados veem perfis" ON public.profiles;
CREATE POLICY "Usuários autenticados veem perfis" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Usuário atualiza próprio perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- updated_at em servers
DROP TRIGGER IF EXISTS update_servers_updated_at ON public.servers;
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;