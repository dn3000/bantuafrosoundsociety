export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CardCarousel, type CarouselItem } from '@/components/CardCarousel'
import { VideoCarousel, type VideoCarouselItem } from '@/components/VideoCarousel'
import { HeroCarousel, type HeroCarouselItem } from '@/components/HeroCarousel'
import {
  MobileGenrePills,
  MobileBassMade,
  MobileBassThisWeek,
  MobileBassSets,
  MobileArtistSpotlight,
  MobilePopularPlaylists,
  MobileMusicVideos,
  MobilePodcasts,
  MobileLiveSets,
  MobileCharts,
  MobileEvents,
} from '@/components/MobileHomeSections'

// ── TEMPORARY sample data — replaced with real CMS data in H2 ────────────────
const SAMPLE_HERO_ITEMS: HeroCarouselItem[] = [
  {
    id: 'sample-1',
    type: 'release',
    kicker: 'Editors Pick',
    headline: 'Shannen SP curates South African electronic underground compilation for TraTraTrax',
    imageUrl: 'https://picsum.photos/seed/bass1/520/680',
    typeBadge: 'Album',
    title: 'TraTraTrax',
    artist: 'Shannen SP',
    date: '05 June 2026',
    href: '/explore',
  },
  {
    id: 'sample-2',
    type: 'playlist',
    kicker: 'New Playlist',
    headline: 'West African night moves — 90 minutes of Afrobeats, Highlife and deep house to close the week',
    imageUrl: 'https://picsum.photos/seed/bass2/520/680',
    typeBadge: 'Playlist',
    title: 'West African Night Moves',
    artist: 'BASS Collective',
    date: '07 June 2026',
    href: '/explore',
  },
  {
    id: 'sample-3',
    type: 'video',
    kicker: 'Live Session',
    headline: 'Watch the full Afrobeats Session #14 — live at Alliance Française, Lagos',
    imageUrl: 'https://picsum.photos/seed/bass3/520/680',
    typeBadge: 'Video',
    title: 'Live at Alliance Française',
    artist: 'Various Artists',
    date: '01 June 2026',
    href: '/watch',
  },
  {
    id: 'sample-4',
    type: 'article',
    kicker: 'Feature',
    headline: 'The new wave of Afro-fusion: producers and vocalists reshaping the sound in 2026',
    imageUrl: 'https://picsum.photos/seed/bass4/520/680',
    typeBadge: 'Article',
    title: 'The New Wave of Afro-Fusion',
    artist: 'BASS Editorial',
    date: '03 June 2026',
    href: '/read',
  },
  {
    id: 'sample-5',
    type: 'release',
    kicker: 'New Release',
    headline: 'Kinshasa Echoes arrives — a collaboration between BASS and the Congo Square collective',
    imageUrl: 'https://picsum.photos/seed/bass5/520/680',
    typeBadge: 'EP',
    title: 'Kinshasa Echoes',
    artist: 'BASS × Congo Square',
    date: '10 June 2026',
    href: '/explore',
  },
]
// ─────────────────────────────────────────────────────────────────────────────

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

type ArticleRead = {
  id: string
  kind: string
  title: string
  slug: string
  dek: string | null
  excerpt: string | null
  source_name: string | null
  cover_image_url: string | null
}

type ArticleLive = {
  id: string
  kind: string | null
  title: string
  slug: string
  dek: string | null
  excerpt: string | null
  source_name: string | null
  cover_image_url: string | null
  author: string
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

  // 1. Live editorial assignments (article_id added by Slice 4 migration)
  const { data: liveItemsRaw } = await supabase
    .from('v_editorial_live')
    .select('slot_id, submission_id, article_id')

  const liveItems = (liveItemsRaw ?? []) as Array<{
    slot_id: string
    submission_id: string | null
    article_id?: string | null
  }>

  // 2. Active editorial slots in display order
  const { data: slots } = await supabase
    .from('editorial_slots')
    .select('id, slot_key, display_name, description, position')
    .eq('is_active', true)
    .order('position', { ascending: true })

  // 3. Submissions for submission-backed live items, with embedded artist
  const liveSubIds = liveItems.filter((i) => i.submission_id).map((i) => i.submission_id as string)
  const liveSubMap: Record<string, Submission> = {}

  if (liveSubIds.length > 0) {
    const { data: liveSubs } = await supabase
      .from('submissions')
      .select('id, title, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
      .in('id', liveSubIds)

    for (const sub of liveSubs ?? []) {
      liveSubMap[(sub as any).id] = sub as unknown as Submission
    }
  }

  // 3b. Articles for article-backed live editorial items
  const liveArticleIds = liveItems
    .map((i) => i.article_id ?? null)
    .filter(Boolean) as string[]
  const liveArticleMap: Record<string, ArticleLive> = {}

  if (liveArticleIds.length > 0) {
    const { data: liveArts } = await supabase
      .from('articles')
      .select('id, kind, title, slug, dek, excerpt, source_name, cover_image_url, author')
      .in('id', liveArticleIds)
    // RLS: only published articles returned — a non-published pick won't render
    for (const a of liveArts ?? []) {
      liveArticleMap[(a as any).id] = a as unknown as ArticleLive
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

  // 9. Recent published articles for the Read carousel
  const { data: articlesRaw } = await supabase
    .from('articles')
    .select('id, kind, title, slug, dek, excerpt, source_name, cover_image_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(10)

  const articles = (articlesRaw ?? []) as ArticleRead[]

  // readItems is derived below, after pickReadArticle is known (so the pick can
  // be deduped from the carousel).

  // 10. Trending Artists — artists with a real avatar, FEATURED first then
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

  // Build slot_id → content lookup (separate maps for submissions and articles)
  const liveSubBySlotId: Record<string, Submission> = {}
  const liveArticleBySlotId: Record<string, ArticleLive> = {}
  for (const item of liveItems) {
    if (item.submission_id) {
      const sub = liveSubMap[item.submission_id]
      if (sub) liveSubBySlotId[item.slot_id] = sub
    } else if (item.article_id) {
      const art = liveArticleMap[item.article_id]
      if (art) liveArticleBySlotId[item.slot_id] = art
    }
  }

  // Hero slot (always submission-backed)
  const heroSlot = (slots ?? []).find((s) => s.slot_key === 'homepage_hero')
  const heroSub = heroSlot ? (liveSubBySlotId[heroSlot.id] ?? null) : null

  // Editor's Pick for the Read section
  const pickReadSlot = (slots ?? []).find((s) => s.slot_key === 'editors_pick_read')
  const pickReadArticle: ArticleLive | null = pickReadSlot
    ? (liveArticleBySlotId[pickReadSlot.id] ?? null)
    : null

  // Recent articles for the Read carousel — pick deduped so it never appears twice
  const readItems: CarouselItem[] = articles
    .filter((a) => a.id !== pickReadArticle?.id)
    .map((a) => ({
      id: a.id,
      cover_image_url: a.cover_image_url,
      title: a.title,
      subtitle:
        a.kind === 'link'
          ? (a.source_name ? `via ${a.source_name}` : null)
          : (a.dek || null),
      href: `/read/${a.slug}`,
    }))

  // Non-hero editorial sections that have a live item (submission or article)
  type EditorialSectionItem =
    | { ref_type: 'submission'; slot: EditorialSlot; sub: Submission }
    | { ref_type: 'article'; slot: EditorialSlot; article: ArticleLive }

  const editorialSections: EditorialSectionItem[] = (slots ?? [])
    .filter((s) => s.slot_key !== 'homepage_hero' && s.slot_key !== 'editors_pick_read')
    .flatMap((slot): EditorialSectionItem[] => {
      const sub = liveSubBySlotId[slot.id]
      if (sub) return [{ ref_type: 'submission', slot, sub }]
      const article = liveArticleBySlotId[slot.id]
      if (article) return [{ ref_type: 'article', slot, article }]
      return []
    })

  const hasContent =
    heroSub ||
    pickReadArticle !== null ||
    editorialSections.length > 0 ||
    readItems.length > 0 ||
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
      {/* ── HERO CAROUSEL (H1 sample data — replaced in H2) ─────────────── */}
      <HeroCarousel items={SAMPLE_HERO_ITEMS} />

      {/* ── MOBILE-ONLY (md:hidden) — Slice B sample sections ───────────── */}
      <MobileGenrePills />
      <MobileBassMade />
      <MobileBassThisWeek />
      <MobileBassSets />
      <MobileArtistSpotlight />
      <MobilePopularPlaylists />
      <MobileMusicVideos />
      <MobilePodcasts />
      <MobileLiveSets />
      <MobileCharts />
      <MobileEvents />

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
          {editorialSections.map((item) => (
            <div key={item.slot.id}>
              <h2
                className="font-bold mb-2 flex items-center gap-1"
                style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--color-fg-primary)' }}
              >
                {item.slot.display_name}
                <ChevronRight size={14} className="text-[var(--color-accent)]" aria-hidden="true" />
              </h2>
              {item.ref_type === 'article' ? (
                <Link
                  href={`/read/${item.article.slug}`}
                  className="group flex items-center gap-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-all duration-[var(--animate-fast)] motion-safe:hover:-translate-y-[4px] motion-safe:hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
                >
                  <div className="w-14 h-14 flex-shrink-0 rounded-[var(--radius)] overflow-hidden">
                    {item.article.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.article.cover_image_url}
                        alt={item.article.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-sm select-none">
                        {item.article.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                      {item.article.title}
                    </p>
                    <p className="text-sm text-[var(--color-fg-secondary)] truncate mt-0.5">
                      {item.article.dek ?? item.article.excerpt ?? item.article.author}
                    </p>
                  </div>
                  <span className="text-[var(--color-fg-tertiary)] flex-shrink-0 text-sm ml-2" aria-hidden>
                    →
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/release/${item.sub.id}`}
                  className="group flex items-center gap-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-all duration-[var(--animate-fast)] motion-safe:hover:-translate-y-[4px] motion-safe:hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
                >
                  <div className="w-14 h-14 flex-shrink-0 rounded-[var(--radius)] overflow-hidden">
                    <ArtworkSquare submission={item.sub} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                      {item.sub.title}
                    </p>
                    <p className="text-sm text-[var(--color-fg-secondary)] truncate mt-0.5">
                      {item.sub.artists?.name ?? 'Unknown Artist'}
                    </p>
                  </div>
                  <span className="text-[var(--color-fg-tertiary)] flex-shrink-0 text-sm ml-2" aria-hidden>
                    →
                  </span>
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── READ ────────────────────────────────────────────────────────── */}
      {(pickReadArticle || readItems.length > 0) && (
        <section className="mb-14">
          <h2
            className="font-bold mb-4 flex items-center gap-1"
            style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--color-fg-primary)' }}
          >
            Read
            <ChevronRight size={14} className="text-[var(--color-accent)]" aria-hidden="true" />
          </h2>

          {/* Editor's Pick featured lead card */}
          {pickReadArticle && (
            <Link
              href={`/read/${pickReadArticle.slug}`}
              className="group flex flex-col sm:flex-row sm:items-start gap-5 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 sm:p-5 hover:bg-[var(--color-bg-higher)] transition-all duration-[var(--animate-default)] mb-6 motion-safe:hover:-translate-y-[4px] motion-safe:hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            >
              {/* Cover image — full-width 16:9 on mobile, fixed square on desktop */}
              <div className="w-full aspect-video sm:w-52 sm:aspect-square sm:flex-shrink-0 rounded-[8px] overflow-hidden">
                {pickReadArticle.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pickReadArticle.cover_image_url}
                    alt={pickReadArticle.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-2xl select-none">
                    {pickReadArticle.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 flex flex-col gap-2 sm:justify-center">
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold">
                  Editor&apos;s Pick →
                </p>
                <h3 className="text-xl sm:text-2xl font-bold leading-tight text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-default)] [font-family:var(--font-heading)]">
                  {pickReadArticle.title}
                </h3>
                {(pickReadArticle.dek ?? pickReadArticle.excerpt) && (
                  <p className="text-sm text-[var(--color-fg-secondary)] line-clamp-2">
                    {pickReadArticle.dek ?? pickReadArticle.excerpt}
                  </p>
                )}
                {pickReadArticle.kind === 'link' && pickReadArticle.source_name && (
                  <span className="self-start text-xs font-medium text-[var(--color-fg-tertiary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2.5 py-1">
                    via {pickReadArticle.source_name}
                  </span>
                )}
              </div>
            </Link>
          )}

          {/* Recent articles carousel — pick already removed from this list */}
          <CardCarousel items={readItems} rows={1} shape="square" />
        </section>
      )}

      {/* ── TRENDING ARTISTS CAROUSEL (desktop only — mobile uses Artist Spotlight) ── */}
      <div className="hidden md:block">
        <CardCarousel title="Trending Artists" items={trendingArtistItems} rows={1} shape="circle" className="mb-14" />
      </div>

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
          <h2
            className="font-bold mb-4 flex items-center gap-1"
            style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--color-fg-primary)' }}
          >
            Latest
            <ChevronRight size={14} className="text-[var(--color-accent)]" aria-hidden="true" />
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {recent.map((sub) => (
              <Link
                key={sub.id}
                href={`/release/${sub.id}`}
                className="group motion-safe:transition-[transform,filter] motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-[4px] motion-safe:hover:drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              >
                <div className="aspect-square rounded-[8px] overflow-hidden mb-2">
                  <ArtworkSquare submission={sub} radiusClass="rounded-[8px]" />
                </div>
                <p className="font-heading text-sm font-semibold text-[var(--color-fg-primary)] line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
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
