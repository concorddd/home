ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
DO $$ BEGIN
  ALTER TABLE public.channels ADD CONSTRAINT channels_kind_check CHECK (kind IN ('text','voice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;