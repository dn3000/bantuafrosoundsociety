-- =========================================
-- Artists: add last_scanned_at telemetry column
-- =========================================
-- Stamped by the Spotify per-artist scraper after each artist is successfully
-- processed (paginated through its albums or stopped early on old releases).
-- Artists whose scan errored out (429, network, etc.) are NOT stamped, so
-- "least recently scanned" naturally surfaces them at the top for retry.
--
-- Powers the admin sort "least recently scanned first" via
-- .order('last_scanned_at', { ascending: true, nullsFirst: true }).
--
-- Existing RLS on artists ("Public can read artists" + "Admins can manage
-- artists") already covers this column — no policy changes needed.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ;

-- Reload PostgREST schema cache so the new column is picked up.
NOTIFY pgrst, 'reload schema';
