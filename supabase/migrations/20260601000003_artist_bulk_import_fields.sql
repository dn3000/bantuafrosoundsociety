-- =========================================
-- Add fields for bulk playlist import
-- =========================================
-- spotify_genres: stores Spotify's raw genre tags separately from BASS's
-- curated subgenres array.
-- source_method: audit trail for how each artist record entered the DB.
-- Unique partial index on spotify_artist_id: prevents duplicate imports.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS spotify_genres TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_method TEXT DEFAULT 'manual';

ALTER TABLE artists
  ADD CONSTRAINT artists_source_method_check
  CHECK (source_method IN ('manual', 'bulk_import', 'scraper', 'contributor_submission'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_spotify_id_unique
  ON artists(spotify_artist_id)
  WHERE spotify_artist_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
