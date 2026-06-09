-- =========================================
-- Tracked Playlists — Spotify playlist scraper content source
-- =========================================
-- Adds tracked_playlists: a curated whitelist of Spotify playlists the playlist
-- scraper scans for new releases. RLS mirrors the artists table exactly — public
-- read (USING true) so the homepage can surface playlists later without an auth
-- round-trip, plus admin-only writes gated by is_admin(). No seed data; admins
-- add playlists through the admin UI.
--
-- This migration is ADDITIVE: it does not touch the per-artist scraper, its
-- tables, or its policies.

-- ============ TRACKED_PLAYLISTS ============
CREATE TABLE tracked_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_playlist_id TEXT UNIQUE NOT NULL,
  name TEXT,
  description TEXT,
  image_url TEXT,
  owner_name TEXT,
  is_active BOOLEAN DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index for the "all active playlists" scan query. (spotify_playlist_id
-- is already indexed by its UNIQUE constraint, so it needs no separate index.)
CREATE INDEX idx_tracked_playlists_active ON tracked_playlists(is_active) WHERE is_active = true;

ALTER TABLE tracked_playlists ENABLE ROW LEVEL SECURITY;

-- Public read (USING true) — same as "Public can read artists".
CREATE POLICY "Public can read tracked_playlists"
  ON tracked_playlists FOR SELECT USING (true);

-- Admin-only writes — same as "Admins can manage artists".
CREATE POLICY "Admins can manage tracked_playlists"
  ON tracked_playlists FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Grants so the roles can actually use the table under RLS (mirrors the artists
-- grants): authenticated gets full DML (still gated to admins by the policy),
-- anon gets read-only (still USING true, but the grant is what enables it).
GRANT SELECT, INSERT, UPDATE, DELETE ON tracked_playlists TO authenticated;
GRANT SELECT ON tracked_playlists TO anon;

-- ============ submissions.source_method: allow 'spotify-playlist' ============
-- The playlist scraper writes source_method = 'spotify-playlist' so playlist-
-- sourced drops are distinguishable from per-artist scraper drops ('scraper').
-- The original inline CHECK (from 20260601000001) only allowed
-- 'scraper' / 'manual' / 'contributor_submission'; widen it so those inserts
-- pass. Postgres named the inline column constraint submissions_source_method_check.
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_source_method_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_source_method_check
  CHECK (source_method IN ('scraper', 'manual', 'contributor_submission', 'spotify-playlist'));

-- Reload PostgREST schema cache so the new table + constraint are picked up.
NOTIFY pgrst, 'reload schema';
