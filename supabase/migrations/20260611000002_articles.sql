-- =========================================
-- articles: Editorial content (Slice 1 — originals)
-- =========================================
-- Mirrors the videos table RLS pattern: is_admin() SECURITY DEFINER.
-- update_updated_at_column() already exists from the initial schema migration.

CREATE TABLE IF NOT EXISTS public.articles (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT         NOT NULL DEFAULT 'original'
                               CHECK (kind IN ('original', 'link')),
  title           TEXT         NOT NULL,
  slug            TEXT         NOT NULL UNIQUE,
  dek             TEXT,
  body            TEXT,
  excerpt         TEXT,
  commentary      TEXT,
  source_url      TEXT,
  source_name     TEXT,
  cover_image_url TEXT,
  author          TEXT         NOT NULL DEFAULT 'BASS',
  tags            TEXT[]       NOT NULL DEFAULT '{}',
  status          TEXT         NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published', 'archived')),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS articles_status_published_idx ON public.articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS articles_slug_idx             ON public.articles (slug);
CREATE INDEX IF NOT EXISTS articles_kind_idx             ON public.articles (kind);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles public read published"
  ON public.articles FOR SELECT
  USING (status = 'published');

CREATE POLICY "articles admin all"
  ON public.articles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Grants (mirrors videos migration)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT SELECT ON public.articles TO anon;

-- Reuse the shared trigger function (update_updated_at_column already exists)
DROP TRIGGER IF EXISTS articles_set_updated_at ON public.articles;
CREATE TRIGGER articles_set_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
