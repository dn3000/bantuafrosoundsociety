-- =========================================
-- Phase 2: Split artist PII into an admin-only sister table
-- =========================================
-- Relocates outreach + identity PII off public.artists into
-- public.artists_private.
--
-- WHY: public.artists has RLS policy "Public can read artists" USING (true)
-- plus a table-level GRANT SELECT to anon, so the anon role can read EVERY
-- column directly via PostgREST — including private_notes, email, manager_*,
-- etc. PII was only ever hidden by the application selecting a safe-column
-- whitelist, never at the database layer. This migration removes the PII
-- columns from artists entirely and moves them to artists_private, which is
-- gated by is_admin() and granted to NO anon role. After it runs, an anon
-- (publishable-key) request for a moved column fails with
-- "column artists.<col> does not exist".
--
-- Applied BY HAND in the Supabase SQL editor — not auto-run. One-shot; wrapped
-- in a transaction so a backfill row-count mismatch aborts the whole thing.

BEGIN;

-- 1. Admin-only sister table -------------------------------------------------
CREATE TABLE public.artists_private (
  artist_id           UUID PRIMARY KEY REFERENCES public.artists(id) ON DELETE CASCADE,
  real_name           TEXT,
  added_by            UUID,        -- references auth.users(id); no cross-schema FK on purpose
  email               TEXT,
  manager_name        TEXT,
  manager_email       TEXT,
  booking_agency      TEXT,
  last_contacted_at   TIMESTAMPTZ,
  -- CHECK + DEFAULT preserved from the original artists.relationship_status so
  -- existing semantics (new artists default to 'cold') survive the move.
  relationship_status TEXT CHECK (relationship_status IN ('cold', 'warm', 'friend', 'collaborator')) DEFAULT 'cold',
  private_notes       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Backfill 1:1 for every artist that carries any PII ----------------------
INSERT INTO public.artists_private (
  artist_id, real_name, added_by, email, manager_name, manager_email,
  booking_agency, last_contacted_at, relationship_status, private_notes
)
SELECT id, real_name, added_by, email, manager_name, manager_email,
       booking_agency, last_contacted_at, relationship_status, private_notes
FROM public.artists
WHERE (real_name IS NOT NULL OR added_by IS NOT NULL OR email IS NOT NULL
       OR manager_name IS NOT NULL OR manager_email IS NOT NULL
       OR booking_agency IS NOT NULL OR last_contacted_at IS NOT NULL
       OR relationship_status IS NOT NULL OR private_notes IS NOT NULL);

-- 3. Verify the backfill copied every PII-bearing row, else abort the txn -----
DO $$
DECLARE
  v_src INTEGER;
  v_dst INTEGER;
BEGIN
  SELECT count(*) INTO v_src FROM public.artists
   WHERE (real_name IS NOT NULL OR added_by IS NOT NULL OR email IS NOT NULL
          OR manager_name IS NOT NULL OR manager_email IS NOT NULL
          OR booking_agency IS NOT NULL OR last_contacted_at IS NOT NULL
          OR relationship_status IS NOT NULL OR private_notes IS NOT NULL);
  SELECT count(*) INTO v_dst FROM public.artists_private;
  RAISE NOTICE 'artists_private backfill: % PII-bearing source rows -> % rows copied', v_src, v_dst;
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch (% source vs % copied) -- aborting', v_src, v_dst;
  END IF;
END $$;

-- 4. Drop the PII columns from the now public-safe artists table --------------
ALTER TABLE public.artists
  DROP COLUMN IF EXISTS real_name,
  DROP COLUMN IF EXISTS added_by,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS manager_name,
  DROP COLUMN IF EXISTS manager_email,
  DROP COLUMN IF EXISTS booking_agency,
  DROP COLUMN IF EXISTS last_contacted_at,
  DROP COLUMN IF EXISTS relationship_status,
  DROP COLUMN IF EXISTS private_notes;

-- 5. RLS + grants: admins only, NO anon --------------------------------------
ALTER TABLE public.artists_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage artists_private" ON public.artists_private
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists_private TO authenticated;
-- Intentionally NO grant to anon and NO public read policy.

-- 6. updated_at trigger (reuses the shared function) -------------------------
CREATE TRIGGER update_artists_private_updated_at
  BEFORE UPDATE ON public.artists_private
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- 7. Reload PostgREST so the dropped columns + new table register immediately
NOTIFY pgrst, 'reload schema';
