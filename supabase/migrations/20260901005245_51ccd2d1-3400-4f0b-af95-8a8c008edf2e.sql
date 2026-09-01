DROP INDEX IF EXISTS public.messages_channel_created_idx;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'online',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'username'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- MESSAGES
DELETE FROM public.messages;

DROP POLICY IF EXISTS "Anyone can post messages" ON public.messages;
DROP POLICY IF EXISTS "Messages are public" ON public.messages;

ALTER TABLE public.messages DROP COLUMN author;
ALTER TABLE public.messages ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX messages_channel_created_idx ON public.messages (channel_id, created_at);

REVOKE ALL ON public.messages FROM anon;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

CREATE POLICY "Authenticated users can read messages"
  ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can post their own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND length(content) >= 1 AND length(content) <= 2000);
CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CHANNELS
DROP POLICY IF EXISTS "Anyone can create channels" ON public.channels;
DROP POLICY IF EXISTS "Channels are public" ON public.channels;

REVOKE ALL ON public.channels FROM anon;
GRANT SELECT, INSERT ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

CREATE POLICY "Authenticated users can read channels"
  ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create channels"
  ON public.channels FOR INSERT TO authenticated
  WITH CHECK (length(name) >= 1 AND length(name) <= 32);

INSERT INTO public.channels (name) VALUES ('geral'), ('dev'), ('random')
ON CONFLICT (name) DO NOTHING;