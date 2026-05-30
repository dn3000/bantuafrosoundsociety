-- =========================================
-- BASS Admin Role + RLS Policies
-- =========================================
-- The new Supabase sb_secret_* key format does not bypass RLS the way the
-- legacy service_role JWT did. Instead of using "TO authenticated" policies
-- (which would grant write access to every signed-in user once public
-- accounts exist), we introduce a user_roles table and gate writes on
-- having an 'admin' row.
--
-- To grant admin to a user later:
--   INSERT INTO user_roles (user_id, role) VALUES ('<user-id>', 'admin');
--
-- Their user_id is visible in Supabase Dashboard -> Authentication -> Users.

-- ============ USER ROLES TABLE ============
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'contributor')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles (useful for UI gating)
CREATE POLICY "Users can read their own roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only admins can modify roles (admins manage admins)
CREATE POLICY "Admins can manage roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- ============ HELPER FUNCTION ============
-- Avoids repeating the EXISTS query in every policy.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ============ TABLE GRANTS ============
-- The authenticated role needs grants before RLS policies can even be evaluated.
GRANT INSERT, UPDATE, DELETE ON
  tracks, artists, labels, releases, mixes, events, posts,
  contributors, playlists, playlist_tracks, mix_tracks
  TO authenticated;

-- ============ ADMIN WRITE POLICIES ============
CREATE POLICY "Admins can manage artists"         ON artists         FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage labels"          ON labels          FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage tracks"          ON tracks          FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage releases"        ON releases        FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage mixes"           ON mixes           FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage events"          ON events          FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage posts"           ON posts           FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage contributors"    ON contributors    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage playlists"       ON playlists       FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage playlist_tracks" ON playlist_tracks FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage mix_tracks"      ON mix_tracks      FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
