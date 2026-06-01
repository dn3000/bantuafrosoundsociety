-- =========================================
-- Add is_tracked flag to artists
-- =========================================
-- Distinguishes actively-scraped artists from "stub" records created via
-- featured-artist credits, lineup mentions, etc. Scrapers only iterate
-- artists where is_tracked = true.

ALTER TABLE artists
  ADD COLUMN is_tracked BOOLEAN DEFAULT false;

CREATE INDEX idx_artists_tracked ON artists(is_tracked) WHERE is_tracked = true;

NOTIFY pgrst, 'reload schema';
