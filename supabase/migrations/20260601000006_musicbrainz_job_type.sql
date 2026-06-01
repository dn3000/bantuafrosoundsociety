-- =========================================
-- Allow 'artist_musicbrainz' job type
-- =========================================

ALTER TABLE backfill_jobs
  DROP CONSTRAINT IF EXISTS backfill_jobs_job_type_check;

ALTER TABLE backfill_jobs
  ADD CONSTRAINT backfill_jobs_job_type_check
  CHECK (job_type IN ('artist_metadata_spotify', 'artist_musicbrainz'));

NOTIFY pgrst, 'reload schema';
