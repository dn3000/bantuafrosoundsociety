-- =========================================
-- Public-Read RLS for Homepage
-- =========================================
-- Sets exactly what an anonymous (logged-out) visitor can read before any
-- public page exists.
--
-- TARGET MATRIX (anon):
--   ALLOW  editorial_slots            — already public, no change
--   ALLOW  v_editorial_live           — already public via view owner bypass, no change
--   ADD    submissions WHERE status='approved'
--   ENSURE artists SELECT             — already public, no change
--   TIGHTEN editorial_slot_assignments — drop public SELECT policy; view still works
--
-- The view (v_editorial_live) was created without SECURITY INVOKER, so it
-- runs as the view owner (postgres) and bypasses table-level RLS.  Anon can
-- still read live editorial data through the view even after we tighten the
-- underlying table.

-- ============================================================
-- 1. editorial_slot_assignments: remove public (anon) SELECT
-- ============================================================
-- Drop the open SELECT policy so a direct anon query returns NO rows.
-- The admin FOR ALL policy ("Admins can manage editorial slot assignments")
-- is left completely untouched.
DROP POLICY IF EXISTS "Public can read editorial slot assignments"
  ON editorial_slot_assignments;

-- anon GRANT SELECT on the table stays (it was given in 20260603000001).
-- RLS with no matching policy for anon defaults to deny, so the grant alone
-- cannot bypass the restriction.

-- ============================================================
-- 2. submissions: anon can SELECT only WHERE status = 'approved'
-- ============================================================
-- The previous policy filtered on status = 'published', but 'published' was
-- removed from the status enum in 20260602000003, making the old policy a
-- no-op (zero rows ever matched).  Replace it with the correct status.
DROP POLICY IF EXISTS "Public can read published submissions" ON submissions;

CREATE POLICY "Public can read approved submissions"
  ON submissions FOR SELECT
  USING (status = 'approved');

-- ============================================================
-- 3. artists — already OK, document only
-- ============================================================
-- "Public can read artists" → USING (true) exists from 20260601000001.
-- anon GRANT SELECT exists.  No changes.

-- ============================================================
-- 4. editorial_slots — already OK, document only
-- ============================================================
-- "Public can read active editorial slots" → USING (is_active = true) exists.
-- anon GRANT SELECT exists.  No changes.

-- ============================================================
-- 5. v_editorial_live — already OK, document only
-- ============================================================
-- GRANT SELECT ON v_editorial_live TO authenticated, anon exists.
-- View is security_invoker = off (default) — runs as postgres, bypasses RLS.
-- Live editorial data reaches anon through the view regardless of the table
-- policy tightening above.  No changes.

NOTIFY pgrst, 'reload schema';
