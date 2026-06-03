-- =========================================
-- Editorial Slot Assignments Queue
-- =========================================
-- Adds a time-windowed queue of assignments per slot.
-- "Live now" for a slot = the assignment whose window covers the current time.
-- Overlap is enforced in the API layer (no btree_gist exclusion constraint).

CREATE TABLE editorial_slot_assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id       uuid        NOT NULL REFERENCES editorial_slots(id) ON DELETE CASCADE,
  submission_id uuid        NOT NULL REFERENCES submissions(id)     ON DELETE CASCADE,
  start_at      timestamptz NOT NULL DEFAULT now(),
  end_at        timestamptz NULL,
  who_assigned  uuid        NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esa_end_after_start CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX idx_esa_slot_start ON editorial_slot_assignments (slot_id, start_at DESC);
CREATE INDEX idx_esa_submission  ON editorial_slot_assignments (submission_id);

-- ============ UPDATED_AT TRIGGER ============
CREATE TRIGGER update_esa_updated_at
  BEFORE UPDATE ON editorial_slot_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ LIVE VIEW ============
-- One row per slot: the currently-live assignment (highest start_at within active window).
CREATE VIEW v_editorial_live AS
SELECT DISTINCT ON (slot_id)
  slot_id,
  id           AS assignment_id,
  submission_id,
  start_at,
  end_at
FROM  editorial_slot_assignments
WHERE start_at <= now()
  AND (end_at IS NULL OR end_at > now())
ORDER BY slot_id, start_at DESC;

-- ============ RLS ============
ALTER TABLE editorial_slot_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read editorial slot assignments"
  ON editorial_slot_assignments FOR SELECT USING (true);

CREATE POLICY "Admins can manage editorial slot assignments"
  ON editorial_slot_assignments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial_slot_assignments TO authenticated;
GRANT SELECT ON editorial_slot_assignments TO anon;
GRANT SELECT ON v_editorial_live TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
