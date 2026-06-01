-- =========================================
-- Backfill jobs tracking
-- =========================================
-- Tracks progress of long-running enrichment jobs so the UI can poll for status.
-- Designed to be lightweight: one row per job, updated as work progresses.

CREATE TABLE backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('artist_metadata_spotify')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_processed_artist_name TEXT,
  last_error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backfill_jobs_status ON backfill_jobs(status);
CREATE INDEX idx_backfill_jobs_started_at ON backfill_jobs(started_at DESC);

ALTER TABLE backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage backfill_jobs"
  ON backfill_jobs FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON backfill_jobs TO authenticated;

NOTIFY pgrst, 'reload schema';
