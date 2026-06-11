-- =========================================
-- videos: add live_show category
-- =========================================
-- live_show covers live production performances/events.
-- Distinct from live_set (DJ sets); curator-assigned only, not auto-detected.

ALTER TABLE videos DROP CONSTRAINT videos_category_check;

ALTER TABLE videos ADD CONSTRAINT videos_category_check
  CHECK (category IN ('mix', 'live_set', 'live_show', 'music_video', 'interview', 'other'));

NOTIFY pgrst, 'reload schema';
