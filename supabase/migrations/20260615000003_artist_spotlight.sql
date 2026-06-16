ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS is_spotlight BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spotlight_order INTEGER;

CREATE INDEX IF NOT EXISTS artists_spotlight_idx
  ON public.artists (spotlight_order)
  WHERE is_spotlight;

NOTIFY pgrst, 'reload schema';
