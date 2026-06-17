-- =========================================
-- charts: Shazam-fed (and manually-editable) ranked track lists
-- =========================================
-- Mirrors the hero_items / bass_this_week RLS pattern: public.is_admin()
-- SECURITY DEFINER. update_updated_at_column() already exists from the
-- initial schema migration.
--
-- Lifecycle (v1, single live chart per chart_key):
--   - Refresh from Shazam → replace draft rows for the chart_key
--     (delete existing status='draft' rows, insert new pull as drafts).
--   - Publish → replace live set (delete published rows, flip drafts to
--     status='published').
-- Public surface reads status='published' rows for the key, ordered by
-- position, and shows captured_at as "as of …".
--
-- artist_id is intentionally NOT a foreign key — same pattern as
-- hero_items.ref_id. It's a soft link to artists(id) for ones the admin
-- has matched against the roster; null is fine.

CREATE TABLE IF NOT EXISTS public.charts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_key       TEXT         NOT NULL,
  source          TEXT         NOT NULL DEFAULT 'shazam'
                               CHECK (source IN ('shazam', 'manual')),
  position        INTEGER      NOT NULL,
  title           TEXT         NOT NULL,
  artist_name     TEXT         NOT NULL,
  artwork_url     TEXT,
  apple_music_url TEXT,
  isrc            TEXT,
  external_id     TEXT,
  artist_id       UUID,
  status          TEXT         NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published')),
  captured_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charts_key_status_pos
  ON public.charts (chart_key, status, position);

CREATE INDEX IF NOT EXISTS idx_charts_key_captured
  ON public.charts (chart_key, captured_at);

ALTER TABLE public.charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published charts"
  ON public.charts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Admins manage charts"
  ON public.charts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Grants (mirrors hero_items / bass_this_week)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charts TO authenticated;
GRANT SELECT ON public.charts TO anon;

-- Reuse the shared trigger function (update_updated_at_column already exists)
DROP TRIGGER IF EXISTS charts_set_updated_at ON public.charts;
CREATE TRIGGER charts_set_updated_at
  BEFORE UPDATE ON public.charts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
