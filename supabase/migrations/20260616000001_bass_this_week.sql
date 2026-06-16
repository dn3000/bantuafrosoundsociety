-- =========================================
-- bass_this_week: Curated weekly picks rail (admin-managed, position-ordered)
-- =========================================
-- Mirrors the hero_items RLS pattern: public.is_admin() SECURITY DEFINER.
-- update_updated_at_column() already exists from the initial schema migration.
--
-- TW1 only uses submission_id (admins pick from approved release/single
-- submissions). The standalone source_url/title/artist_name/artwork_url
-- columns are reserved for the TW3 paste-a-link slice — they let an admin
-- add an item that doesn't have a matching submission row yet.

CREATE TABLE IF NOT EXISTS public.bass_this_week (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  position      INTEGER      NOT NULL DEFAULT 0,
  submission_id UUID         REFERENCES public.submissions(id) ON DELETE CASCADE,
  source_url    TEXT,
  title         TEXT,
  artist_name   TEXT,
  artwork_url   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT bass_this_week_oneof CHECK (
    submission_id IS NOT NULL
    OR (source_url IS NOT NULL AND title IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS bass_this_week_position_idx
  ON public.bass_this_week (position);

ALTER TABLE public.bass_this_week ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read bass_this_week"
  ON public.bass_this_week FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins manage bass_this_week"
  ON public.bass_this_week FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Grants (mirrors hero_items)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bass_this_week TO authenticated;
GRANT SELECT ON public.bass_this_week TO anon;

-- Reuse the shared trigger function (update_updated_at_column already exists)
DROP TRIGGER IF EXISTS bass_this_week_set_updated_at ON public.bass_this_week;
CREATE TRIGGER bass_this_week_set_updated_at
  BEFORE UPDATE ON public.bass_this_week
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
