-- =========================================
-- Capture working state from SQL Editor adjustments
-- =========================================
-- During RLS debugging we made several adjustments directly in the Supabase
-- SQL Editor. This migration captures them in version control so the working
-- state is reproducible if the database is ever reset.
--
-- Key learnings encoded here:
--   * is_admin() uses SECURITY DEFINER to bypass RLS on user_roles (avoids
--     infinite recursion with the "Admins can manage roles" policy).
--   * Explicit SET search_path = public, pg_temp ensures user_roles is found.
--   * authenticated role needs SELECT grants for .insert().select() to work
--     (PostgREST translates that to INSERT ... RETURNING which needs SELECT).

-- ============ FINAL is_admin() STATE ============
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ============ SELECT GRANTS ============
-- The authenticated role needs SELECT on tables it writes to, because
-- PostgREST's .insert().select() pattern needs SELECT privilege.
-- The anon role needs SELECT for the public read policies to work.
GRANT SELECT ON
  tracks, artists, labels, releases, mixes, events, posts,
  contributors, playlists, playlist_tracks, mix_tracks
  TO authenticated, anon;

-- ============ RELOAD POSTGREST SCHEMA ============
NOTIFY pgrst, 'reload schema';
