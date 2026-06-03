-- =========================================
-- Extend submissions table for Review Queue
-- =========================================

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'));

-- Expand status check constraint
ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'deferred', 'needs_work'));

CREATE INDEX IF NOT EXISTS idx_submissions_status_priority ON submissions(status, priority, created_at DESC);

NOTIFY pgrst, 'reload schema';
