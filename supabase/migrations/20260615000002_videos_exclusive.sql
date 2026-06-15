ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
