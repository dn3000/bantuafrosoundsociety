-- =========================================
-- YouTube Topic channel → release ingestion
-- =========================================
-- Adds youtube_video_id (nullable) to submissions for deduplication of
-- YouTube-sourced rows, and widens the source_method CHECK to include
-- 'youtube-topic'. All existing values from prior migrations are preserved.
--
-- IMPORTANT: Run this SQL in the Supabase SQL Editor after deploy.
-- Auto-apply is not configured; this matches the pattern of prior migrations.

-- 1. Add youtube_video_id column (nullable; only populated for YouTube rows)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

-- 2. Widen source_method CHECK — keep ALL existing values
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_source_method_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_source_method_check
  CHECK (source_method IN (
    'scraper',
    'manual',
    'contributor_submission',
    'spotify-playlist',
    'youtube-topic'
  ));

-- 3. Partial unique index for dedup — only enforced when youtube_video_id is set
CREATE UNIQUE INDEX IF NOT EXISTS submissions_youtube_video_id_unique
  ON submissions (youtube_video_id)
  WHERE youtube_video_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
