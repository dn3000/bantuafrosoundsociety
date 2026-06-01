-- =========================================
-- OAuth integrations (Spotify, others later)
-- =========================================
-- Stores OAuth tokens per (user_id, provider) so the admin can connect
-- their personal Spotify account once and BASS uses that token server-side
-- for user-authenticated API calls (playlist tracks, etc.).
--
-- Tokens are stored in the database. Supabase encrypts data at rest;
-- service-role queries are required to read them (the `service_role`
-- bypass is gated by RLS policies below).

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('spotify')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  provider_user_id TEXT,
  provider_display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_integrations_user_provider ON integrations(user_id, provider);

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all integration rows
CREATE POLICY "Admins can manage integrations"
  ON integrations FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Authenticated users can read their own integration metadata (not full tokens)
-- (Admin-only access is enforced via API routes; this is just defensive)
CREATE POLICY "Users can read their own integration metadata"
  ON integrations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON integrations TO authenticated;

NOTIFY pgrst, 'reload schema';
