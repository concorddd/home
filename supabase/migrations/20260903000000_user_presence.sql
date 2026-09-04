-- ============================================================
-- Sistema de presença (status automático por atividade)
-- ============================================================

-- 1) Colunas de presença na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

-- 2) Índice para buscas rápidas de presença
CREATE INDEX IF NOT EXISTS profiles_presence_idx ON public.profiles (is_online, last_active_at);

-- 3) Função para atualizar última atividade (heartbeat)
CREATE OR REPLACE FUNCTION public.update_user_activity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now(),
      is_online = true
  WHERE id = auth.uid();
END;
$$;

-- 4) Função para marcar usuário como offline
CREATE OR REPLACE FUNCTION public.set_user_offline()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = false,
      status = 'invisível'
  WHERE id = auth.uid();
END;
$$;

-- 5) Função para definir status manualmente
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

-- 6) Função automática para marcar ausente após 1h sem atividade
-- (pode ser chamada por um cron job ou na leitura)
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
  
  -- Se está marcado como ocupado ou não perturbe, mantém
  IF user_profile.status IN ('ocupado', 'não perturbe', 'não perturbar') THEN
    RETURN user_profile.status;
  END IF;
  
  -- Se está marcado como invisível/offline, mantém
  IF user_profile.status IN ('invisível', 'offline') THEN
    RETURN user_profile.status;
  END IF;
  
  -- Se não está online no sistema
  IF NOT user_profile.is_online THEN
    RETURN 'invisível';
  END IF;
  
  -- Se passou mais de 1h sem atividade -> ausente
  IF user_profile.last_active_at < now() - interval '1 hour' THEN
    RETURN 'ausente';
  END IF;
  
  -- Caso contrário, está online
  RETURN 'online';
END;
$$;

-- 7) Políticas para permitir atualização própria
GRANT EXECUTE ON FUNCTION public.update_user_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_offline TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_effective_status TO authenticated;
