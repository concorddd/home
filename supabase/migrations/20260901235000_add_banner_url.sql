-- Adiciona coluna banner_url para upload de banner personalizado
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;

-- Comentário sobre a coluna
COMMENT ON COLUMN public.profiles.banner_url IS 'URL da imagem de banner do perfil do usuário';