ALTER TABLE public.tracked_playlists
  ADD COLUMN IF NOT EXISTS is_bass_made BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
