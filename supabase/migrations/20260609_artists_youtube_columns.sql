-- =========================================
-- Artists: add YouTube channel identity columns
-- =========================================
-- Establishes the two YouTube identity columns on artists ahead of any
-- ingestion logic. Both are nullable — we populate them incrementally once
-- we know the correct channel IDs for each artist.
--
-- youtube_channel_id: the UC… channel ID (works for both OAC and Topic).
-- youtube_handle:     the @handle shown on the channel page (OAC only;
--                     auto-generated Topic channels rarely have a custom handle).
--
-- Existing RLS ("Admins can manage artists") already covers these columns —
-- no policy changes needed.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_handle TEXT;

-- Reload PostgREST schema cache so the new columns are picked up immediately.
NOTIFY pgrst, 'reload schema';
