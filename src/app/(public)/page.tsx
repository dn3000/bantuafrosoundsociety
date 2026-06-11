export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CardCarousel, type CarouselItem } from '@/components/CardCarousel'
import { VideoCarousel, type VideoCarouselItem } from '@/components/VideoCarousel'

// ── Types ─────────────────────────────────────────────────────────────────────

type ArtistEmbed = {
  name: string
  image_url: string | null
}

type Submission = {
  id: string
  title: string
  artwork_url: string | null
  cover_image_url: string | null
  source_url: string
  created_at: string
  artists: ArtistEmbed | null
}

type ReleaseSubmission = Submission & {
  type: string
  release_date: string | null
}

type CuratedPlaylist = {
  id: string
  spotify_playlist_id: string
  name: string | null
  curator_name: string | null
  cover_image_url: string | null
  image_url: string | null
}

type VideoRow = {
  id: string
  title: string
  thumbnail_url: string | null
  category: string
  published_at: string | null
  artists: { name: string } | null
}

type TrendingArtist = {
  id: string
  name: string
  country: string | null
  image_url: string | null
  spotify_artist_id: string | null
  tier: string | null
}

type EditorialSlot = {
  id: string
  slot_key: string
  display_name: string
  description: string | null
  position: number
}

// ── Image helpers ──────────────────────────────────────────────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getImageSrc(sub: Submission): string | null {
  if (isRenderableImage(sub.artwork_url)) return sub.artwork_url!
  if (isRenderableImage(sub.cover_image_url)) return sub.cover_image_url!
  if (isRenderableImage(sub.artists?.image_url)) return sub.artists!.image_url!
  return null
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// ── New Releases mapping helpers ───────────────────────────────────────────────

const NEW_RELEASE_TYPE_LABELS: Record<string, string> = {
  single: 'SINGLE',
  release: 'ALBUM',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// release_date is a DATE ("YYYY-MM-DD"); parse the parts directly so the month
// never shifts due to UTC-vs-local timezone conversion.
function formatMonthYear(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const monthIdx = Number(m[2]) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return `${MONTH_NAMES[monthIdx]} ${m[1]}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ArtworkSquare({
  submission,
  className,
  radiusClass = 'rounded-[var(--radius-md)]',
}: {
  submission: Submission
  className?: string
  radiusClass?: string
}) {
  const src = getImageSrc(submission)
  const base = `${radiusClass} object-cover ${className ?? ''}`

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={submission.title}
        className={`${base} w-full h-full`}
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`${base} w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-base select-none`}
    >
      {getInitials(submission.title)}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createClient()

  // 1. Live editorial assignments
  const { data: liveItems } = await supabase
    .from('v_editorial_live')
    .select('slot_id, submission_id')

  // 2. Active editorial slots in display order
  const { data: slots } = await supabase
    .from('editorial_slots')
    .select('id, slot_key, display_name, description, position')
    .eq('is_active', true)
    .order('position', { ascending: true })

  // 3. Submissions for live items, with embedded artist
  const liveSubIds = (liveItems ?? []).map((i) => i.submission_id)
  const liveSubMap: Record<string, Submission> = {}

  if (liveSubIds.length > 0) {
    const { data: liveSubs } = await supabase
      .from('submissions')
      .select('id, title, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
      .in('id', liveSubIds)

    for (const sub of liveSubs ?? []) {
      liveSubMap[sub.id] = sub as unknown as Submission
    }
  }

  // 4. Recent approved submissions
  const { data: recentRaw } = await supabase
    .from('submissions')
    .select('id, title, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(12)

  const recent = (recentRaw ?? []) as unknown as Submission[]

  // 5. Recent approved music releases for the New Releases carousel
  const { data: newReleasesRaw } = await supabase
    .from('submissions')
    .select('id, title, type, release_date, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
    .eq('status', 'approved')
    .in('type', ['release', 'single'])
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(20)

  const newReleases = (newReleasesRaw ?? []) as unknown as ReleaseSubmission[]

  const newReleaseItems: CarouselItem[] = newReleases.map((sub) => {
    const typeLabel = NEW_RELEASE_TYPE_LABELS[sub.type] ?? sub.type.toUpperCase()
    const monthYear = sub.release_date ? formatMonthYear(sub.release_date) : null
    const meta = monthYear ? `${typeLabel} · ${monthYear}` : typeLabel
    return {
      id: sub.id,
      label: typeLabel,
      artwork_url: sub.artwork_url,
      cover_image_url: sub.cover_image_url,
      artist_image_url: sub.artists?.image_url ?? null,
      title: sub.title,
      subtitle: sub.artists?.name ?? 'Unknown Artist',
      meta,
      href: `/release/${sub.id}`,
    }
  })

  // 6. New Albums — approved type='release' only, release_date desc nulls last
  const { data: newAlbumsRaw } = await supabase
    .from('submissions')
    .select('id, title, type, release_date, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
    .eq('status', 'approved')
    .eq('type', 'release')
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(16)

  const newAlbums = (newAlbumsRaw ?? []) as unknown as ReleaseSubmission[]

  const newAlbumItems: CarouselItem[] = newAlbums.map((sub) => {
    const monthYear = sub.release_date ? formatMonthYear(sub.release_date) : null
    const meta = monthYear ? `ALBUM · ${monthYear}` : 'ALBUM'
    return {
      id: sub.id,
      label: 'ALBUM',
      artwork_url: sub.artwork_url,
      cover_image_url: sub.cover_image_url,
      artist_image_url: sub.artists?.image_url ?? null,
      title: sub.title,
      subtitle: sub.artists?.name ?? 'Unknown Artist',
      meta,
      href: `/release/${sub.id}`,
    }
  })

  // 7. Curated playlists — published, ordered by display_order asc then updated_at desc
  const { data: playlistsRaw } = await supabase
    .from('tracked_playlists')
    .select('id, spotify_playlist_id, name, curator_name, cover_image_url, image_url')
    .eq('is_published', true)
    .order('display_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(12)

  const playlists = (playlistsRaw ?? []) as CuratedPlaylist[]

  const playlistItems: CarouselItem[] = playlists.map((pl) => ({
    id: pl.id,
    label: 'PLAYLIST',
    cover_image_url: pl.cover_image_url,
    artist_image_url: pl.image_url,
    title: pl.name ?? 'Untitled Playlist',
    subtitle: pl.curator_name,
    href: `/playlist/${pl.id}`,
  }))

  // 8. Watch: approved videos by category (mix / live_set / music_video), published_at desc
  const VIDEO_COLS = 'id, title, thumbnail_url, category, published_at, artists(name)'
  const VIDEO_ORDER = { ascending: false, nullsFirst: false } as const

  const [{ data: mixVideosRaw }, { data: liveSetVideosRaw }, { data: musicVideoVideosRaw }] =
    await Promise.all([
      supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'mix').order('published_at', VIDEO_ORDER).limit(12),
      supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'live_set').order('published_at', VIDEO_ORDER).limit(12),
      supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'music_video').order('published_at', VIDEO_ORDER).limit(12),
    ])

  function toVideoItems(rows: VideoRow[]): VideoCarouselItem[] {
    return rows.map((v) => ({
      id: v.id,
      title: v.title,
      artist: v.artists?.name ?? null,
      category: v.category,
      thumbnail_url: v.thumbnail_url,
      href: `/watch/${v.id}`,
    }))
  }

  const mixItems = toVideoItems((mixVideosRaw ?? []) as unknown as VideoRow[])
  const liveSetItems = toVideoItems((liveSetVideosRaw ?? []) as unknown as VideoRow[])
  const musicVideoItems = toVideoItems((musicVideoVideosRaw ?? []) as unknown as VideoRow[])

  // 9. Trending Artists — artists with a real avatar, FEATURED first then
  // ACTIVE, then WATCH, name ASC for ties. PostgREST can't express a CASE
  // ordering directly, so we fetch a bounded pool and sort by tier-priority
  // in JS before slicing the top 18.
  const { data: trendingArtistsRaw } = await supabase
    .from('artists')
    .select('id, name, country, image_url, spotify_artist_id, tier')
    .not('image_url', 'is', null)
    .limit(200)

  const TIER_PRIORITY: Record<string, number> = { featured: 0, active: 1, watch: 2 }

  const trendingArtists = ((trendingArtistsRaw ?? []) as TrendingArtist[])
    .slice()
    .sort((a, b) => {
      const ap = TIER_PRIORITY[a.tier ?? ''] ?? 99
      const bp = TIER_PRIORITY[b.tier ?? ''] ?? 99
      if (ap !== bp) return ap - bp
      return a.name.localeCompare(b.name)
    })
    .slice(0, 18)

  const trendingArtistItems: CarouselItem[] = trendingArtists.map((artist) => {
    const country = artist.country?.trim() || null
    return {
      id: artist.id,
      artwork_url: artist.image_url,
      title: artist.name,
      subtitle: country,
      href: artist.spotify_artist_id
        ? `https://open.spotify.com/artist/${artist.spotify_artist_id}`
        : undefined,
    }
  })

  // Build slot_id → submission lookup
  const liveBySlotId: Record<string, Submission> = {}
  for (const item of liveItems ?? []) {
    const sub = liveSubMap[item.submission_id]
    if (sub) liveBySlotId[item.slot_id] = sub
  }

  // Hero slot
  const heroSlot = (slots ?? []).find((s) => s.slot_key === 'homepage_hero')
  const heroSub = heroSlot ? (liveBySlotId[heroSlot.id] ?? null) : null

  // Non-hero editorial sections that have a live item
  const editorialSections: Array<{ slot: EditorialSlot; sub: Submission }> = (
    slots ?? []
  )
    .filter((s) => s.slot_key !== 'homepage_hero')
    .flatMap((slot) => {
      const sub = liveBySlotId[slot.id]
      return sub ? [{ slot, sub }] : []
    })

  const hasContent =
    heroSub ||
    editorialSections.length > 0 ||
    trendingArtistItems.length > 0 ||
    newAlbumItems.length > 0 ||
    newReleaseItems.length > 0 ||
    playlistItems.length > 0 ||
    mixItems.length > 0 ||
    liveSetItems.length > 0 ||
    musicVideoItems.length > 0 ||
    recent.length > 0

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {!hasContent && (
        <p className="text-[var(--color-fg-tertiary)] text-sm text-center mt-24">
          Coming soon.
        </p>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      {heroSub && (
        <section className="mb-14">
          <Link
            href={`/release/${heroSub.id}`}
            className="group flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10"
          >
            {/* Artwork */}
            <div className="sm:w-64 sm:flex-shrink-0 aspect-square rounded-[var(--radius-md)] overflow-hidden">
              <ArtworkSquare submission={heroSub} />
            </div>

            {/* Text */}
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
                Featured
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2 group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-default)]">
                {heroSub.title}
              </h1>
              <p className="text-[var(--color-fg-secondary)] mb-5">
                {heroSub.artists?.name ?? 'Unknown Artist'}
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]">
                Listen ↗
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* ── EDITORIAL SECTIONS ───────────────────────────────────────────── */}
      {editorialSections.length > 0 && (
        <section className="mb-14 space-y-6">
          {editorialSections.map(({ slot, sub }) => (
            <div key={slot.id}>
              <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-2 flex items-center gap-1.5">
                <span className="text-[var(--color-accent)]" aria-hidden>→</span>
                {slot.display_name}
              </h2>
              <Link
                href={`/release/${sub.id}`}
                className="group flex items-center gap-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-colors duration-[var(--animate-fast)]"
              >
                <div className="w-14 h-14 flex-shrink-0 rounded-[var(--radius)] overflow-hidden">
                  <ArtworkSquare submission={sub} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                    {sub.title}
                  </p>
                  <p className="text-sm text-[var(--color-fg-secondary)] truncate mt-0.5">
                    {sub.artists?.name ?? 'Unknown Artist'}
                  </p>
                </div>
                <span className="text-[var(--color-fg-tertiary)] flex-shrink-0 text-sm ml-2" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* ── TRENDING ARTISTS CAROUSEL ────────────────────────────────────── */}
      <CardCarousel title="Trending Artists" items={trendingArtistItems} rows={1} shape="circle" className="mb-14" />

      {/* ── NEW ALBUMS CAROUSEL ──────────────────────────────────────────── */}
      <CardCarousel title="New Albums" items={newAlbumItems} rows={1} className="mb-14" />

      {/* ── PLAYLISTS CAROUSEL ──────────────────────────────────────────── */}
      <CardCarousel title="Playlists" items={playlistItems} rows={1} shape="square" className="mb-14" />

      {/* ── NEW RELEASES CAROUSEL ────────────────────────────────────────── */}
      <CardCarousel title="New Releases" items={newReleaseItems} rows={2} className="mb-14" />

      {/* ── WATCH: VIDEO CAROUSELS ───────────────────────────────────────── */}
      <VideoCarousel title="Mixes" items={mixItems} className="mb-14" />
      <VideoCarousel title="Live Sets" items={liveSetItems} className="mb-14" />
      <VideoCarousel title="Music Videos" items={musicVideoItems} className="mb-14" />

      {/* ── LATEST APPROVED ──────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4 flex items-center gap-1.5">
            <span className="text-[var(--color-accent)]" aria-hidden>→</span>
            Latest
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {recent.map((sub) => (
              <Link
                key={sub.id}
                href={`/release/${sub.id}`}
                className="group"
              >
                <div className="aspect-square rounded-[8px] overflow-hidden mb-2">
                  <ArtworkSquare submission={sub} radiusClass="rounded-[8px]" />
                </div>
                <p className="text-sm font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                  {sub.title}
                </p>
                <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
                  {sub.artists?.name ?? 'Unknown Artist'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
