-- =========================================
-- hero_items: Ordered, publishable hero rail entries (polymorphic refs)
-- =========================================
-- Mirrors the articles/videos RLS pattern: public.is_admin() SECURITY DEFINER.
-- update_updated_at_column() already exists from the initial schema migration.
-- ref_id is intentionally NOT a foreign key — it's polymorphic across
-- (submission, video, playlist, article). The admin layer validates that
-- ref_id points at a real row of ref_type.

CREATE TABLE IF NOT EXISTS public.hero_items (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  position      INT          NOT NULL DEFAULT 0,
  ref_type      TEXT         NOT NULL
                             CHECK (ref_type IN ('submission', 'video', 'playlist', 'article')),
  ref_id        UUID         NOT NULL,
  kicker        TEXT,
  headline      TEXT,
  is_published  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_items_pub_pos ON public.hero_items (is_published, position);

ALTER TABLE public.hero_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published hero items"
  ON public.hero_items FOR SELECT
  USING (is_published = TRUE);

CREATE POLICY "Admins manage hero items"
  ON public.hero_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Grants (mirrors articles/videos migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_items TO authenticated;
GRANT SELECT ON public.hero_items TO anon;

-- Reuse the shared trigger function (update_updated_at_column already exists)
DROP TRIGGER IF EXISTS hero_items_set_updated_at ON public.hero_items;
CREATE TRIGGER hero_items_set_updated_at
  BEFORE UPDATE ON public.hero_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
