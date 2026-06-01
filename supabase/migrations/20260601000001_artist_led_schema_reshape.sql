-- =========================================
-- BASS Schema Reshape: Artist-Led Aggregator Model
-- =========================================
-- Pivots from a track-catalog model to a curated aggregator centered on a
-- vetted artist whitelist. Drops the legacy content tables and rebuilds:
--
-- Domain 1 - Scene Graph: artists (rich, scraped) + contacts (outreach)
-- Domain 2 - Content: submissions (unified content table) + scrape_sources
-- Domain 3 - Editorial: editorial_slots + slot_history + reshaped posts/events
--
-- All writes gated by is_admin() (existing function from prior migrations).

-- ============ DROP LEGACY TABLES ============
-- Order matters due to FK constraints.
DROP TABLE IF EXISTS playlist_tracks CASCADE;
DROP TABLE IF EXISTS mix_tracks CASCADE;
DROP TABLE IF EXISTS playlists CASCADE;
DROP TABLE IF EXISTS mixes CASCADE;
DROP TABLE IF EXISTS tracks CASCADE;
DROP TABLE IF EXISTS releases CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS artists CASCADE;

-- Posts and events reference old tables via array columns — recreate them too.
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- =========================================
-- DOMAIN 1: SCENE GRAPH
-- =========================================

-- ============ ARTISTS ============
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  real_name TEXT,
  bio TEXT,
  image_url TEXT,
  -- Location
  country TEXT DEFAULT 'South Africa',
  city TEXT,
  -- Sound
  subgenres TEXT[] DEFAULT '{}',
  active_years TEXT,
  -- BASS status
  tier TEXT CHECK (tier IN ('featured', 'active', 'watch')) DEFAULT 'active',
  status TEXT CHECK (status IN ('active', 'inactive', 'hiatus')) DEFAULT 'active',
  is_verified BOOLEAN DEFAULT false,
  date_added DATE DEFAULT CURRENT_DATE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Platform IDs (for scraping)
  spotify_artist_id TEXT,
  apple_music_artist_id TEXT,
  beatport_artist_url TEXT,
  bandcamp_url TEXT,
  soundcloud_handle TEXT,
  mixcloud_handle TEXT,
  youtube_channel_id TEXT,
  tidal_artist_id TEXT,
  discogs_artist_id TEXT,
  musicbrainz_artist_id TEXT,
  -- Social
  instagram_handle TEXT,
  twitter_handle TEXT,
  tiktok_handle TEXT,
  facebook_url TEXT,
  website_url TEXT,
  -- Outreach (admin-only)
  email TEXT,
  manager_name TEXT,
  manager_email TEXT,
  booking_agency TEXT,
  last_contacted_at TIMESTAMPTZ,
  relationship_status TEXT CHECK (relationship_status IN ('cold', 'warm', 'friend', 'collaborator')) DEFAULT 'cold',
  private_notes TEXT,
  -- Bookkeeping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artists_slug ON artists(slug);
CREATE INDEX idx_artists_tier ON artists(tier);
CREATE INDEX idx_artists_status ON artists(status);
CREATE INDEX idx_artists_subgenres ON artists USING GIN(subgenres);
CREATE INDEX idx_artists_spotify_id ON artists(spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;
CREATE INDEX idx_artists_bandcamp ON artists(bandcamp_url) WHERE bandcamp_url IS NOT NULL;

-- ============ CONTACTS ============
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('label', 'promoter', 'festival', 'manager', 'agency', 'venue', 'media', 'other')) NOT NULL,
  description TEXT,
  country TEXT DEFAULT 'South Africa',
  city TEXT,
  website TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  image_url TEXT,
  -- Contact
  email TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  phone TEXT,
  -- Relationship
  last_contacted_at TIMESTAMPTZ,
  relationship_status TEXT CHECK (relationship_status IN ('cold', 'warm', 'friend', 'collaborator')) DEFAULT 'cold',
  private_notes TEXT,
  -- Bookkeeping
  date_added DATE DEFAULT CURRENT_DATE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_slug ON contacts(slug);
CREATE INDEX idx_contacts_type ON contacts(type);
CREATE INDEX idx_contacts_relationship ON contacts(relationship_status);

-- ============ ARTIST_CONTACTS (join) ============
CREATE TABLE artist_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_type TEXT CHECK (relationship_type IN ('label', 'manager', 'booking', 'publisher', 'collaborator', 'other')) NOT NULL,
  is_current BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, contact_id, relationship_type)
);

CREATE INDEX idx_artist_contacts_artist ON artist_contacts(artist_id);
CREATE INDEX idx_artist_contacts_contact ON artist_contacts(contact_id);

-- =========================================
-- DOMAIN 2: CONTENT
-- =========================================

-- ============ SUBMISSIONS ============
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Classification
  type TEXT CHECK (type IN ('release', 'single', 'mix', 'playlist', 'video', 'podcast', 'dj_set')) NOT NULL,
  source TEXT CHECK (source IN ('spotify', 'apple_music', 'youtube', 'youtube_music', 'beatport', 'bandcamp', 'soundcloud', 'mixcloud', 'tidal', 'other')) NOT NULL,
  source_url TEXT NOT NULL,
  platform_id TEXT,
  -- Identity
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  primary_artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  additional_artist_ids UUID[] DEFAULT '{}',
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  creator_name TEXT,
  -- Media
  artwork_url TEXT,
  duration_seconds INTEGER,
  release_date DATE,
  preview_url TEXT,
  embed_url TEXT,
  platform_links JSONB DEFAULT '{}'::jsonb,
  -- Tagging
  subgenres TEXT[] DEFAULT '{}',
  mood_tags TEXT[] DEFAULT '{}',
  bpm_range_low INTEGER,
  bpm_range_high INTEGER,
  energy INTEGER CHECK (energy BETWEEN 1 AND 10),
  description TEXT,
  ai_relevance_score INTEGER CHECK (ai_relevance_score BETWEEN 1 AND 10),
  -- Workflow
  source_method TEXT CHECK (source_method IN ('scraper', 'manual', 'contributor_submission')) NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contributor_id UUID REFERENCES contributors(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'published', 'archived')) DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  -- Bookkeeping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Dedup: same URL should not be submitted twice
  UNIQUE(source_url)
);

CREATE INDEX idx_submissions_type ON submissions(type);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_primary_artist ON submissions(primary_artist_id);
CREATE INDEX idx_submissions_contact ON submissions(contact_id);
CREATE INDEX idx_submissions_release_date ON submissions(release_date DESC);
CREATE INDEX idx_submissions_published_at ON submissions(published_at DESC);
CREATE INDEX idx_submissions_subgenres ON submissions USING GIN(subgenres);
CREATE INDEX idx_submissions_source ON submissions(source);
CREATE INDEX idx_submissions_platform_id ON submissions(source, platform_id) WHERE platform_id IS NOT NULL;

-- ============ SCRAPE_SOURCES ============
CREATE TABLE scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('spotify', 'apple_music', 'youtube', 'beatport', 'bandcamp', 'soundcloud', 'mixcloud', 'musicbrainz')) NOT NULL,
  source_url TEXT NOT NULL,
  last_polled_at TIMESTAMPTZ,
  last_successful_at TIMESTAMPTZ,
  last_result_count INTEGER DEFAULT 0,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist_id, platform)
);

CREATE INDEX idx_scrape_sources_artist ON scrape_sources(artist_id);
CREATE INDEX idx_scrape_sources_active ON scrape_sources(is_active) WHERE is_active = true;
CREATE INDEX idx_scrape_sources_last_polled ON scrape_sources(last_polled_at);

-- =========================================
-- DOMAIN 3: EDITORIAL
-- =========================================

-- ============ EDITORIAL_SLOTS ============
CREATE TABLE editorial_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  -- Either reference a submission OR an artist (for spotlight-type slots)
  current_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  current_artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  -- Display
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_editorial_slots_key ON editorial_slots(slot_key);
CREATE INDEX idx_editorial_slots_active ON editorial_slots(is_active);

-- Seed the canonical slot positions so admin UI has them to populate
INSERT INTO editorial_slots (slot_key, display_name, description, position) VALUES
  ('homepage_hero', 'Homepage Hero', 'The main featured item at the top of the homepage', 1),
  ('track_of_the_day', 'Track of the Day', 'A single track highlighted daily', 2),
  ('album_of_the_month', 'Album of the Month', 'Featured release for the current month', 3),
  ('artist_spotlight', 'Artist Spotlight', 'Featured artist of the moment', 4),
  ('this_weeks_mix', 'This Week''s Mix', 'Featured DJ set or mix', 5),
  ('upcoming_release', 'Upcoming Release', 'Highlighted forthcoming release', 6),
  ('trending', 'Trending', 'Currently trending submission', 7);

-- ============ SLOT_HISTORY ============
CREATE TABLE slot_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key TEXT NOT NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX idx_slot_history_key ON slot_history(slot_key);
CREATE INDEX idx_slot_history_started ON slot_history(started_at DESC);

-- ============ POSTS (rebuilt) ============
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT,
  post_type TEXT CHECK (post_type IN ('interview', 'scene_report', 'review', 'opinion', 'roundup', 'feature', 'news_commentary')),
  hero_image_url TEXT,
  related_artist_ids UUID[] DEFAULT '{}',
  related_submission_ids UUID[] DEFAULT '{}',
  related_contact_ids UUID[] DEFAULT '{}',
  author_name TEXT,
  contributor_id UUID REFERENCES contributors(id) ON DELETE SET NULL,
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
CREATE INDEX idx_posts_artists ON posts USING GIN(related_artist_ids);

-- ============ EVENTS (rebuilt) ============
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
  promoter_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  venue_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ticket_url TEXT,
  poster_url TEXT,
  source_url TEXT,
  is_bass_recommended BOOLEAN DEFAULT false,
  subgenres TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('draft', 'published', 'cancelled', 'past')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_events_date ON events(event_date DESC);
CREATE INDEX idx_events_city ON events(city);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_lineup ON events USING GIN(lineup_artist_ids);

-- =========================================
-- UPDATED_AT TRIGGERS
-- =========================================

CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_editorial_slots_updated_at BEFORE UPDATE ON editorial_slots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- ROW LEVEL SECURITY + POLICIES
-- =========================================

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- ===== PUBLIC READ POLICIES =====
-- Artists: public can see all (we don't expose private_notes / outreach via the public client anyway; column-level filtering at the query layer)
CREATE POLICY "Public can read artists" ON artists FOR SELECT USING (true);

-- Contacts: NOT public — outreach data only visible to admins
-- (no SELECT policy for anon/authenticated; admin policy below covers admin reads)

-- Submissions: public can read published + approved
CREATE POLICY "Public can read published submissions" ON submissions FOR SELECT USING (status = 'published');

-- Editorial slots: public can read active slots
CREATE POLICY "Public can read active editorial slots" ON editorial_slots FOR SELECT USING (is_active = true);

-- Posts: public can read published
CREATE POLICY "Public can read published posts" ON posts FOR SELECT USING (is_published = true);

-- Events: public can read published
CREATE POLICY "Public can read published events" ON events FOR SELECT USING (status = 'published');

-- ===== ADMIN WRITE POLICIES =====
CREATE POLICY "Admins can manage artists"         ON artists         FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage contacts"        ON contacts        FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage artist_contacts" ON artist_contacts FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage submissions"     ON submissions     FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage scrape_sources"  ON scrape_sources  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage editorial_slots" ON editorial_slots FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage slot_history"    ON slot_history    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage posts"           ON posts           FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can manage events"          ON events          FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- =========================================
-- GRANTS
-- =========================================
-- Needed for the authenticated role to actually use the tables under RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  artists, contacts, artist_contacts, submissions, scrape_sources,
  editorial_slots, slot_history, posts, events
  TO authenticated;

-- Public read access for the anon role on public-readable tables
GRANT SELECT ON
  artists, submissions, editorial_slots, posts, events
  TO anon;

-- =========================================
-- RELOAD POSTGREST
-- =========================================
NOTIFY pgrst, 'reload schema';

-- =========================================
-- END
-- =========================================
