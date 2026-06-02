-- =========================================
-- Extended social URLs
-- =========================================
-- Add columns for socials that MusicBrainz tracks but we didn't have proper columns for.
-- Will be populated from existing MB audit notes via a one-shot extraction.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS bandcamp_url TEXT,
  ADD COLUMN IF NOT EXISTS soundcloud_url TEXT,
  ADD COLUMN IF NOT EXISTS discogs_url TEXT,
  ADD COLUMN IF NOT EXISTS wikipedia_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

NOTIFY pgrst, 'reload schema';
