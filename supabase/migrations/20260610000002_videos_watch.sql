-- =========================================
-- videos: Watch review lane (Slice 2b-i)
-- =========================================
-- Separate content type for watchable video content ingested from YouTube OAC.
-- Videos require per-item review before going public; no auto-publish.

CREATE TABLE videos (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id        UUID         REFERENCES artists(id) ON DELETE CASCADE,
  youtube_video_id TEXT         NOT NULL,
  title            TEXT         NOT NULL,
  category         TEXT         NOT NULL DEFAULT 'other'
    CHECK (category IN ('mix', 'live_set', 'music_video', 'interview', 'other')),
  published_at     TIMESTAMPTZ,
  thumbnail_url    TEXT,
  status           TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  source_method    TEXT         NOT NULL DEFAULT 'youtube-oac',
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX videos_youtube_video_id_unique ON videos (youtube_video_id);

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read approved videos"
  ON videos FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Admins can manage videos"
  ON videos FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ===== GRANTS =====
GRANT SELECT, INSERT, UPDATE, DELETE ON videos TO authenticated;
GRANT SELECT ON videos TO anon;

NOTIFY pgrst, 'reload schema';
