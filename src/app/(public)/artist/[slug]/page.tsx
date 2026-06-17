export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getInitials, isRenderableImage } from '@/lib/artist-display'

// ── Types ─────────────────────────────────────────────────────────────────────
// Safe columns only — PII (email, manager_*, booking_agency, last_contacted_at,
// relationship_status, private_notes, added_by) is never selected here.

type Artist = {
  id: string
  slug: string
  name: string
  real_name: string | null
  aliases: string[] | null
  bio: string | null
  image_url: string | null
  country: string | null
  city: string | null
  subgenres: string[] | null
  active_years: string | null
  tier: 'featured' | 'active' | 'watch'
  is_verified: boolean
  is_spotlight: boolean
  spotify_artist_id: string | null
  apple_music_artist_id: string | null
  beatport_artist_url: string | null
  bandcamp_url: string | null
  soundcloud_handle: string | null
  soundcloud_url: string | null
  mixcloud_handle: string | null
  youtube_channel_id: string | null
  youtube_handle: string | null
  youtube_url: string | null
  instagram_handle: string | null
  twitter_handle: string | null
  tiktok_handle: string | null
  facebook_url: string | null
  website_url: string | null
}

type Release = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
  cover_image_url: string | null
  source_url: string | null
  embed_url: string | null
  youtube_video_id: string | null
}

type Video = {
  id: string
  title: string
  thumbnail_url: string | null
  youtube_video_id: string
  category: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ARTIST_COLUMNS = [
  'id, slug, name, real_name, aliases, bio, image_url, country, city, subgenres, active_years',
  'tier, is_verified, is_spotlight',
  'spotify_artist_id, apple_music_artist_id, beatport_artist_url, bandcamp_url',
  'soundcloud_handle, soundcloud_url, mixcloud_handle',
  'youtube_channel_id, youtube_handle, youtube_url',
  'instagram_handle, twitter_handle, tiktok_handle, facebook_url, website_url',
].join(', ')

const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'SINGLE',
  release: 'ALBUM',
  mix: 'MIX',
  playlist: 'PLAYLIST',
  video: 'VIDEO',
  podcast: 'PODCAST',
  dj_set: 'DJ SET',
}

const VIDEO_CATEGORY_LABELS: Record<string, string> = {
  mix: 'MIX',
  live_set: 'LIVE SET',
  live_show: 'LIVE SHOW',
  music_video: 'MUSIC VIDEO',
  interview: 'INTERVIEW',
  other: 'VIDEO',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchArtist(slug: string): Promise<Artist | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('artists')
    .select(ARTIST_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return null
  return data as unknown as Artist
}

async function fetchReleases(artistId: string): Promise<Release[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('submissions')
    .select(
      'id, title, type, release_date, artwork_url, cover_image_url, source_url, embed_url, youtube_video_id, created_at'
    )
    .eq('primary_artist_id', artistId)
    .eq('status', 'approved')
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return ((data ?? []) as unknown as Release[])
}

async function fetchVideos(artistId: string): Promise<Video[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('videos')
    .select('id, title, thumbnail_url, youtube_video_id, category, created_at')
    .eq('artist_id', artistId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  return ((data ?? []) as unknown as Video[])
}

function getReleaseArtwork(r: Release): string | null {
  if (isRenderableImage(r.artwork_url)) return r.artwork_url!
  if (isRenderableImage(r.cover_image_url)) return r.cover_image_url!
  return null
}

// release_date is a DATE ("YYYY-MM-DD"); parse parts directly to avoid UTC drift.
function formatReleaseYear(dateStr: string | null): string | null {
  if (!dateStr) return null
  const m = /^(\d{4})/.exec(dateStr)
  return m ? m[1] : null
}

// Truncate to a description-safe length; tries to break on a sentence boundary
// near the cutoff before falling back to a hard slice + ellipsis.
function truncateForMeta(s: string, max = 200): string {
  const clean = s.trim().replace(/\s+/g, ' ')
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const lastSentence = slice.lastIndexOf('. ')
  if (lastSentence > max * 0.6) return slice.slice(0, lastSentence + 1)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + '…'
}

type SocialLink = { label: string; href: string }

function buildPlatformLinks(a: Artist): SocialLink[] {
  const out: SocialLink[] = []
  if (a.spotify_artist_id) {
    out.push({ label: 'Spotify', href: `https://open.spotify.com/artist/${a.spotify_artist_id}` })
  }
  // Prefer the canonical channel URL when we have an Official Artist Channel id.
  if (a.youtube_channel_id) {
    out.push({ label: 'YouTube', href: `https://www.youtube.com/channel/${a.youtube_channel_id}` })
  } else if (a.youtube_handle) {
    const handle = a.youtube_handle.startsWith('@') ? a.youtube_handle : `@${a.youtube_handle}`
    out.push({ label: 'YouTube', href: `https://www.youtube.com/${handle}` })
  } else if (a.youtube_url) {
    out.push({ label: 'YouTube', href: a.youtube_url })
  }
  if (a.apple_music_artist_id) {
    out.push({ label: 'Apple Music', href: `https://music.apple.com/artist/${a.apple_music_artist_id}` })
  }
  if (a.beatport_artist_url) {
    out.push({ label: 'Beatport', href: a.beatport_artist_url })
  }
  if (a.bandcamp_url) {
    out.push({ label: 'Bandcamp', href: a.bandcamp_url })
  }
  // soundcloud_url wins when both fields are set (full URL is more reliable
  // than a handle the scraper may have munged).
  if (a.soundcloud_url) {
    out.push({ label: 'SoundCloud', href: a.soundcloud_url })
  } else if (a.soundcloud_handle) {
    out.push({ label: 'SoundCloud', href: `https://soundcloud.com/${a.soundcloud_handle}` })
  }
  if (a.mixcloud_handle) {
    out.push({ label: 'Mixcloud', href: `https://www.mixcloud.com/${a.mixcloud_handle}/` })
  }
  return out
}

function buildSocialLinks(a: Artist): SocialLink[] {
  const out: SocialLink[] = []
  if (a.instagram_handle) {
    out.push({ label: 'Instagram', href: `https://instagram.com/${a.instagram_handle}` })
  }
  if (a.twitter_handle) {
    out.push({ label: 'Twitter / X', href: `https://x.com/${a.twitter_handle}` })
  }
  if (a.tiktok_handle) {
    const h = a.tiktok_handle.startsWith('@') ? a.tiktok_handle.slice(1) : a.tiktok_handle
    out.push({ label: 'TikTok', href: `https://www.tiktok.com/@${h}` })
  }
  if (a.facebook_url) {
    out.push({ label: 'Facebook', href: a.facebook_url })
  }
  if (a.website_url) {
    out.push({ label: 'Website', href: a.website_url })
  }
  return out
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const artist = await fetchArtist(slug)
  if (!artist) return { title: 'Artist not found | BASS' }

  const location = [artist.city, artist.country].filter(Boolean).join(', ')
  const primaryGenre = artist.subgenres?.[0]
  const fallbackParts = [location, primaryGenre].filter(Boolean)
  const description = artist.bio
    ? truncateForMeta(artist.bio)
    : fallbackParts.length > 0
      ? `${artist.name} — ${fallbackParts.join(' · ')} on BASS.`
      : `${artist.name} on BASS.`

  const ogImage = isRenderableImage(artist.image_url) ? [artist.image_url!] : undefined

  return {
    title: `${artist.name} | BASS`,
    description,
    openGraph: ogImage
      ? { title: `${artist.name} | BASS`, description, images: ogImage }
      : { title: `${artist.name} | BASS`, description },
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ArtistAvatar({ artist }: { artist: Artist }) {
  if (isRenderableImage(artist.image_url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={artist.image_url!}
        alt={artist.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    )
  }
  const tierBg: Record<Artist['tier'], string> = {
    featured: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    active: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    watch: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }
  return (
    <div className={`w-full h-full flex items-center justify-center text-3xl sm:text-4xl font-semibold select-none ${tierBg[artist.tier]}`}>
      {getInitials(artist.name)}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]">
      {children}
    </span>
  )
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'accent' | 'neutral'
}) {
  const styles: Record<typeof variant, string> = {
    accent: 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]',
    neutral: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${styles[variant]}`}>
      {children}
    </span>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-bold mb-4 text-[var(--color-fg-primary)]"
      style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem' }}
    >
      {children}
    </h2>
  )
}

function ReleaseCard({ release }: { release: Release }) {
  const artwork = getReleaseArtwork(release)
  const typeLabel = RELEASE_TYPE_LABELS[release.type] ?? release.type.toUpperCase()
  const year = formatReleaseYear(release.release_date)
  const meta = year ? `${typeLabel} · ${year}` : typeLabel
  return (
    <Link
      href={`/release/${release.id}`}
      className="group block"
    >
      <div className="relative aspect-square rounded-[8px] overflow-hidden mb-2 bg-[var(--color-bg-higher)]">
        {artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artwork}
            alt={release.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-2xl select-none">
            {getInitials(release.title)}
          </div>
        )}
      </div>
      <p className="text-[13px] font-medium text-white line-clamp-2 leading-snug group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-default)]">
        {release.title}
      </p>
      <p className="text-xs text-white/50 line-clamp-1 mt-0.5">{meta}</p>
    </Link>
  )
}

function VideoCard({ video }: { video: Video }) {
  // Fall back to YouTube's hosted thumbnail if our scrape didn't capture one
  // — every video row has a youtube_video_id (NOT NULL in migration).
  const thumb = isRenderableImage(video.thumbnail_url)
    ? video.thumbnail_url!
    : `https://i.ytimg.com/vi/${video.youtube_video_id}/hqdefault.jpg`
  const categoryLabel = VIDEO_CATEGORY_LABELS[video.category] ?? video.category.toUpperCase()
  return (
    <Link
      href={`/watch/${video.id}`}
      className="group block"
    >
      <div className="relative aspect-video rounded-[8px] overflow-hidden mb-2 bg-[var(--color-bg-higher)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <p className="text-[13px] font-medium text-white line-clamp-2 leading-snug group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-default)]">
        {video.title}
      </p>
      <p className="text-xs text-white/50 line-clamp-1 mt-0.5">{categoryLabel}</p>
    </Link>
  )
}

function LinkPill({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]"
    >
      {label} ↗
    </a>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const artist = await fetchArtist(slug)
  if (!artist) notFound()

  const [releases, videos] = await Promise.all([
    fetchReleases(artist.id),
    fetchVideos(artist.id),
  ])

  const location = [artist.city, artist.country].filter(Boolean).join(', ')
  const platformLinks = buildPlatformLinks(artist)
  const socialLinks = buildSocialLinks(artist)
  const allLinks = [...platformLinks, ...socialLinks]

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)] mb-8"
      >
        <span className="text-[var(--color-accent)]" aria-hidden>←</span>
        Back to home
      </Link>

      {/* Hero — two-column on desktop, stacked on mobile */}
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-10">
        {/* Avatar */}
        <div className="sm:w-[280px] sm:flex-shrink-0">
          <div className="aspect-square w-full sm:max-w-[280px] rounded-[8px] overflow-hidden">
            <ArtistAvatar artist={artist} />
          </div>
        </div>

        {/* Metadata */}
        <div className="flex-1 flex flex-col">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
            Artist
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2">
            {artist.name}
          </h1>
          {artist.real_name && artist.real_name.trim() !== artist.name.trim() && (
            <p className="text-[var(--color-fg-secondary)] text-base mb-2">
              {artist.real_name}
            </p>
          )}
          {location && (
            <p className="text-xs uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4">
              {location}
            </p>
          )}

          {(artist.is_spotlight || artist.is_verified) && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {artist.is_spotlight && <Badge variant="accent">Featured</Badge>}
              {artist.is_verified && <Badge variant="neutral">Verified</Badge>}
            </div>
          )}

          {artist.subgenres && artist.subgenres.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {artist.subgenres.map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          )}

          {artist.bio && (
            <p className="text-sm text-[var(--color-fg-secondary)] leading-relaxed whitespace-pre-line">
              {artist.bio}
            </p>
          )}
        </div>
      </section>

      {/* Platform / social links — external links live HERE; the homepage card
          funnels users in to this page first, then this page funnels out. */}
      {allLinks.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-2 flex-wrap">
            {allLinks.map((link) => (
              <LinkPill key={`${link.label}:${link.href}`} label={link.label} href={link.href} />
            ))}
          </div>
        </section>
      )}

      {/* Listen — approved submissions only. Omit the section if empty. */}
      {releases.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Listen</SectionHeading>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            {releases.map((r) => (
              <ReleaseCard key={r.id} release={r} />
            ))}
          </div>
        </section>
      )}

      {/* Watch — approved videos only. Omit the section if empty. */}
      {videos.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Watch</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
