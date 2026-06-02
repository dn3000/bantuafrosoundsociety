ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT;

NOTIFY pgrst, 'reload schema';
