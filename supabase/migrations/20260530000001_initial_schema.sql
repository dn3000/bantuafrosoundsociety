-- =========================================
-- BASS Initial Schema Migration
-- =========================================

-- ============ ARTISTS ============
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  country TEXT DEFAULT 'South Africa',
  city TEXT,
  subgenres TEXT[] DEFAULT '{}',
  image_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  platform_links JSONB DEFAULT '{}'::jsonb,
  is_verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artists_slug ON artists(slug);
CREATE INDEX idx_artists_subgenres ON artists USING GIN(subgenres);

-- ============ LABELS ============
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  country TEXT DEFAULT 'South Africa',
  website TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_labels_slug ON labels(slug);

-- ============ TRACKS ============
CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  release_id UUID,
  duration_seconds INTEGER,
  bpm INTEGER,
  key TEXT,
  energy INTEGER CHECK (energy BETWEEN 1 AND 10),
  subgenres TEXT[] DEFAULT '{}',
  mood_tags TEXT[] DEFAULT '{}',
  vocal_type TEXT,
  release_date DATE,
  artwork_url TEXT,
  preview_url TEXT,
  preview_source TEXT,
  platform_links JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  notes TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracks_slug ON tracks(slug);
CREATE INDEX idx_tracks_artist ON tracks(artist_id);
CREATE INDEX idx_tracks_label ON tracks(label_id);
CREATE INDEX idx_tracks_release_date ON tracks(release_date DESC);
CREATE INDEX idx_tracks_subgenres ON tracks USING GIN(subgenres);
CREATE INDEX idx_tracks_mood ON tracks USING GIN(mood_tags);
CREATE INDEX idx_tracks_published ON tracks(is_published);

-- ============ RELEASES ============
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  release_type TEXT CHECK (release_type IN ('single', 'ep', 'album', 'compilation', 'remix')),
  release_date DATE,
  is_upcoming BOOLEAN DEFAULT false,
  subgenres TEXT[] DEFAULT '{}',
  artwork_url TEXT,
  platform_links JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  notes TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_releases_slug ON releases(slug);
CREATE INDEX idx_releases_artist ON releases(artist_id);
CREATE INDEX idx_releases_label ON releases(label_id);
CREATE INDEX idx_releases_date ON releases(release_date DESC);
CREATE INDEX idx_releases_upcoming ON releases(is_upcoming);
CREATE INDEX idx_releases_subgenres ON releases USING GIN(subgenres);

-- Link tracks back to releases now that releases table exists
ALTER TABLE tracks ADD CONSTRAINT tracks_release_fkey
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE SET NULL;

-- ============ MIXES ============
CREATE TABLE mixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  dj_artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  contributor_id UUID,
  duration_seconds INTEGER,
  subgenres TEXT[] DEFAULT '{}',
  mood_tags TEXT[] DEFAULT '{}',
  description TEXT,
  artwork_url TEXT,
  primary_platform TEXT,
  embed_url TEXT,
  platform_links JSONB DEFAULT '{}'::jsonb,
  recorded_date DATE,
  published_date DATE,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mixes_slug ON mixes(slug);
CREATE INDEX idx_mixes_dj ON mixes(dj_artist_id);
CREATE INDEX idx_mixes_published_date ON mixes(published_date DESC);
CREATE INDEX idx_mixes_featured ON mixes(is_featured);

-- ============ EVENTS ============
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  venue TEXT,
  city TEXT,
  country TEXT DEFAULT 'South Africa',
  lineup_artist_ids UUID[] DEFAULT '{}',
  lineup_text TEXT,
  ticket_url TEXT,
  poster_url TEXT,
  source_url TEXT,
  is_bass_recommended BOOLEAN DEFAULT false,
  subgenres TEXT[] DEFAULT '{}',
  is_published BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_date ON events(event_date DESC);
CREATE INDEX idx_events_city ON events(city);
CREATE INDEX idx_events_published ON events(is_published);

-- ============ POSTS (Editorial) ============
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT,
  post_type TEXT CHECK (post_type IN ('interview', 'scene_report', 'review', 'opinion', 'roundup', 'feature', 'news_commentary')),
  hero_image_url TEXT,
  related_artist_ids UUID[] DEFAULT '{}',
  related_track_ids UUID[] DEFAULT '{}',
  related_mix_id UUID REFERENCES mixes(id) ON DELETE SET NULL,
  author_name TEXT,
  contributor_id UUID,
  published_date DATE,
  is_published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_type ON posts(post_type);
CREATE INDEX idx_posts_published_date ON posts(published_date DESC);
CREATE INDEX idx_posts_published ON posts(is_published);

-- ============ CONTRIBUTORS ============
CREATE TABLE contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  city TEXT,
  country TEXT DEFAULT 'South Africa',
  role_badges TEXT[] DEFAULT '{}',
  avatar_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  status TEXT CHECK (status IN ('pending', 'verified', 'paused', 'revoked')) DEFAULT 'pending',
  invited_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contributors_slug ON contributors(slug);
CREATE INDEX idx_contributors_status ON contributors(status);
CREATE INDEX idx_contributors_user_id ON contributors(user_id);

-- Link mixes and posts to contributors
ALTER TABLE mixes ADD CONSTRAINT mixes_contributor_fkey
  FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE SET NULL;
ALTER TABLE posts ADD CONSTRAINT posts_contributor_fkey
  FOREIGN KEY (contributor_id) REFERENCES contributors(id) ON DELETE SET NULL;

-- ============ PLAYLISTS ============
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  curator_type TEXT CHECK (curator_type IN ('bass', 'contributor', 'ai_generated')) DEFAULT 'bass',
  contributor_id UUID REFERENCES contributors(id) ON DELETE SET NULL,
  cover_image_url TEXT,
  primary_platform TEXT,
  external_url TEXT,
  embed_url TEXT,
  platform_links JSONB DEFAULT '{}'::jsonb,
  subgenres TEXT[] DEFAULT '{}',
  mood_tags TEXT[] DEFAULT '{}',
  bpm_range_low INTEGER,
  bpm_range_high INTEGER,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  status TEXT CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')) DEFAULT 'draft',
  published_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_playlists_slug ON playlists(slug);
CREATE INDEX idx_playlists_contributor ON playlists(contributor_id);
CREATE INDEX idx_playlists_status ON playlists(status);
CREATE INDEX idx_playlists_featured ON playlists(is_featured);

-- ============ PLAYLIST_TRACKS (join) ============
CREATE TABLE playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, position)
);

CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX idx_playlist_tracks_track ON playlist_tracks(track_id);

-- ============ MIX_TRACKS (join) ============
CREATE TABLE mix_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_id UUID NOT NULL REFERENCES mixes(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  timestamp_seconds INTEGER,
  manual_title TEXT,
  manual_artist TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mix_id, position)
);

CREATE INDEX idx_mix_tracks_mix ON mix_tracks(mix_id);
CREATE INDEX idx_mix_tracks_track ON mix_tracks(track_id);

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_labels_updated_at BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_releases_updated_at BEFORE UPDATE ON releases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mixes_updated_at BEFORE UPDATE ON mixes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contributors_updated_at BEFORE UPDATE ON contributors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ ROW LEVEL SECURITY ============
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mix_tracks ENABLE ROW LEVEL SECURITY;

-- Public read policies (anyone can read PUBLISHED content)
CREATE POLICY "Public can read published artists" ON artists FOR SELECT USING (true);
CREATE POLICY "Public can read published labels" ON labels FOR SELECT USING (true);
CREATE POLICY "Public can read published tracks" ON tracks FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read published releases" ON releases FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read published mixes" ON mixes FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read published events" ON events FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read published posts" ON posts FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read verified contributors" ON contributors FOR SELECT USING (status = 'verified');
CREATE POLICY "Public can read published playlists" ON playlists FOR SELECT USING (is_published = true);
CREATE POLICY "Public can read playlist_tracks of published playlists" ON playlist_tracks FOR SELECT USING (
  EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_tracks.playlist_id AND playlists.is_published = true)
);
CREATE POLICY "Public can read mix_tracks of published mixes" ON mix_tracks FOR SELECT USING (
  EXISTS (SELECT 1 FROM mixes WHERE mixes.id = mix_tracks.mix_id AND mixes.is_published = true)
);

-- Note: Write policies for authenticated admins will be added in a later migration
-- once we set up auth + roles. For now, all writes go through the service_role key
-- (server-side admin client) which bypasses RLS.
