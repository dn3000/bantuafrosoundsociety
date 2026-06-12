-- =========================================
-- editorial: article-backed assignments (Slice 4 — Editor's Pick)
-- =========================================
-- Adds content_type to editorial_slots and article_id to
-- editorial_slot_assignments, then rebuilds v_editorial_live.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).

-- 1. content_type on slots (drives which picker the admin modal shows)
ALTER TABLE public.editorial_slots
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'submission'
  CHECK (content_type IN ('submission', 'article'));

-- 2. allow article-backed assignments
ALTER TABLE public.editorial_slot_assignments
  ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE;

ALTER TABLE public.editorial_slot_assignments
  ALTER COLUMN submission_id DROP NOT NULL;

-- exactly one content reference per row (guarded so re-runs don't error)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorial_assignment_one_ref') THEN
    ALTER TABLE public.editorial_slot_assignments
      ADD CONSTRAINT editorial_assignment_one_ref
      CHECK ((submission_id IS NOT NULL)::int + (article_id IS NOT NULL)::int = 1);
  END IF;
END $$;

-- 3. rebuild the live view to expose article_id
-- (DROP+CREATE required because the column list changes)
DROP VIEW IF EXISTS public.v_editorial_live;
CREATE VIEW public.v_editorial_live AS
SELECT DISTINCT ON (slot_id)
  slot_id,
  id          AS assignment_id,
  submission_id,
  article_id,
  start_at,
  end_at
FROM public.editorial_slot_assignments
WHERE start_at <= now()
  AND (end_at IS NULL OR end_at > now())
ORDER BY slot_id, start_at DESC;

-- Re-grant (DROP removes prior grants on the view)
GRANT SELECT ON public.v_editorial_live TO authenticated, anon;

-- 4. seed the Editor's Pick (Read) slot
INSERT INTO public.editorial_slots (slot_key, display_name, description, position, is_active, content_type)
VALUES ('editors_pick_read', 'Editor''s Pick', 'Featured article from BASS Read', 8, true, 'article')
ON CONFLICT (slot_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
