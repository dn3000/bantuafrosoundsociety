-- =========================================
-- video_picks: hand-pinned "ride above" curation for the homepage video rows
-- =========================================
-- Each of the 6 homepage video rows is keyed by a rail_key (NOT the videos
-- category enum, because "Exclusive Sets" is is_exclusive=true across any
-- category — not a category of its own). A pick rides ABOVE the chronological
-- feed for its rail: the homepage renders picks (by position) first, then fills
-- the rest of the row chronologically, deduped by video_id, capped at 12.
--
-- Only approved videos should be pinned (enforced in the admin API). Per-rail
-- position uniqueness is intentionally NOT enforced at the DB level so the admin
-- UI can reorder by swapping position values without deferred-constraint churn;
-- the admin UI is the source of truth for ordering.
--
-- update_updated_at_column() already exists from the initial schema migration.

CREATE TABLE public.video_picks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rail_key   TEXT        NOT NULL
                         CHECK (rail_key IN ('exclusive_sets','bass_sets','music_videos','podcasts','live_sets','mixes')),
  video_id   UUID        NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  position   INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rail_key, video_id)
);

CREATE INDEX idx_video_picks_rail_position ON public.video_picks (rail_key, position);

ALTER TABLE public.video_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read video picks"
  ON public.video_picks FOR SELECT
  USING (true);

CREATE POLICY "Admins manage video picks"
  ON public.video_picks FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_picks TO authenticated;
GRANT SELECT ON public.video_picks TO anon;

DROP TRIGGER IF EXISTS video_picks_set_updated_at ON public.video_picks;
CREATE TRIGGER video_picks_set_updated_at
  BEFORE UPDATE ON public.video_picks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
