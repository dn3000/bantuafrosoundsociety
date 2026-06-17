-- =========================================
-- Review Queue (β): atomic "approve + promote" RPCs
-- =========================================
-- Two SECURITY DEFINER functions that flip a source row's status to 'approved'
-- AND insert the promotion-target slot row in ONE transaction. A plpgsql
-- function body is a single implicit transaction, so either both the status
-- flip and the slot insert commit, or neither does.
--
-- Why SECURITY DEFINER: the function runs as its owner (the migration role),
-- which has the table privileges and bypasses RLS. Authorization is enforced
-- explicitly at the top of each function via public.is_admin() — exactly the
-- same gate the admin RLS policies use (see 20260530000003). Non-admins get a
-- 42501 (→ HTTP 403 via PostgREST).
--
-- Grounding (columns/enums verified against migrations):
--   submissions.status CHECK ('pending','approved','rejected','deferred','needs_work')
--     — 20260601000001 (table) + 20260602000003 (status widened)
--   submissions.approved_by / approved_at                      — 20260601000001
--   videos.status CHECK ('pending','approved','rejected')      — 20260610000002
--     (videos has NO approved_by/approved_at columns — do not write them)
--   bass_this_week (submission_id, position, ...)              — 20260616000001
--   hero_items (ref_type ['submission','video','playlist','article'], ref_id,
--     kicker, headline, position, is_published)                — 20260614000001
--
-- NOTE on approved_at: the spec lists only status + approved_by, but every
-- existing approve path (PATCH /submissions/[id], /submissions/bulk) also sets
-- approved_at = now(). We set it here too so promote-approved rows carry the
-- same audit trail; omitting it would create inconsistent history.

-- =========================================
-- Function A: approve a submission AND add it to bass_this_week
-- =========================================
CREATE OR REPLACE FUNCTION public.approve_and_promote_to_this_week(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated  integer;
  v_position integer;
  v_existing uuid;
  v_btw_id   uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1. Flip status → approved (audit fields included for parity).
  UPDATE public.submissions
     SET status      = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
   WHERE id = p_submission_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;

  -- 2. Idempotent promote: bass_this_week.submission_id is the natural key for
  --    "this submission is already a pick". If present, return it rather than
  --    inserting a duplicate.
  SELECT id INTO v_existing
    FROM public.bass_this_week
   WHERE submission_id = p_submission_id
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'submission_id', p_submission_id,
      'this_week_id', v_existing,
      'already_present', true
    );
  END IF;

  -- 3. Append at the end of the rail.
  SELECT COALESCE(MAX(position), -1) + 1 INTO v_position
    FROM public.bass_this_week;

  INSERT INTO public.bass_this_week (submission_id, position)
  VALUES (p_submission_id, v_position)
  RETURNING id INTO v_btw_id;

  RETURN jsonb_build_object(
    'ok', true,
    'submission_id', p_submission_id,
    'this_week_id', v_btw_id,
    'position', v_position,
    'already_present', false
  );
END;
$$;

-- =========================================
-- Function B: approve a submission OR video AND add it to hero_items
-- =========================================
CREATE OR REPLACE FUNCTION public.approve_and_promote_to_hero(
  p_id       uuid,
  p_type     text,
  p_kicker   text DEFAULT NULL,
  p_headline text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated  integer;
  v_position integer;
  v_hero_id  uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('submission', 'video') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  -- 1. Flip the source row's status → approved.
  IF p_type = 'submission' THEN
    UPDATE public.submissions
       SET status      = 'approved',
           approved_by = auth.uid(),
           approved_at = now()
     WHERE id = p_id;
  ELSE
    -- videos has no approved_by/approved_at columns.
    UPDATE public.videos
       SET status = 'approved'
     WHERE id = p_id;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  -- 2. Append a hero entry, unpublished. Publishing stays a separate, explicit
  --    action on /admin/hero (hero_items.is_published defaults false anyway).
  SELECT COALESCE(MAX(position), -1) + 1 INTO v_position
    FROM public.hero_items;

  INSERT INTO public.hero_items (ref_type, ref_id, kicker, headline, position, is_published)
  VALUES (
    p_type,
    p_id,
    NULLIF(btrim(p_kicker), ''),
    NULLIF(btrim(p_headline), ''),
    v_position,
    false
  )
  RETURNING id INTO v_hero_id;

  RETURN jsonb_build_object(
    'ok', true,
    'hero_id', v_hero_id,
    'ref_type', p_type,
    'ref_id', p_id,
    'position', v_position,
    'is_published', false
  );
END;
$$;

-- =========================================
-- Grants — callable by the authenticated (admin-gated) role only.
-- =========================================
GRANT EXECUTE ON FUNCTION public.approve_and_promote_to_this_week(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_promote_to_hero(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
