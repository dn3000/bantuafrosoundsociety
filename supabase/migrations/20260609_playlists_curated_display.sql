-- ============================================================
-- Curated playlist display — extend tracked_playlists
-- ============================================================
-- Additive: adds display-centric columns and restricts the
-- public SELECT policy to is_published rows.
-- Existing scraper columns (is_active, last_scanned_at) are
-- untouched — the playlist scraper still works as before.

ALTER TABLE tracked_playlists
  ADD COLUMN IF NOT EXISTS curator_name    TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS track_count     INT,
  ADD COLUMN IF NOT EXISTS is_published    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- Narrow the public policy from USING (true) to only expose
-- published playlists. The admin write policy (is_admin() FOR ALL)
-- already covers SELECT for admins, so they still see every row.
DROP POLICY IF EXISTS "Public can read tracked_playlists" ON tracked_playlists;

CREATE POLICY "Public can read tracked_playlists"
  ON tracked_playlists FOR SELECT
  USING (is_published = true);

NOTIFY pgrst, 'reload schema';
