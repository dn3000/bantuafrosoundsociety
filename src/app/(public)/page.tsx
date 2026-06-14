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
  MobilePodcasts,
  MobileCharts,
  MobileEvents,
  MobileMerch,
} from '@/components/MobileHomeSections'
import { SiteFooter } from '@/components/SiteFooter'

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

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createClient()

  // 1. Live editorial assignments — only article-backed slots survive the prune
  // (the only slot we still surface here is editors_pick_read).
  const { data: liveItemsRaw } = await supabase
    .from('v_editorial_live')
    .select('slot_id, article_id')

  const liveItems = (liveItemsRaw ?? []) as Array<{
    slot_id: string
    article_id?: string | null
  }>

  // 2. Active editorial slots — we just need slot_key to locate editors_pick_read
  const { data: slots } = await supabase
    .from('editorial_slots')
    .select('id, slot_key')
    .eq('is_active', true)

  // 3. Articles for article-backed live editorial items
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
    for (const a of (liveArts ?? []) as unknown as ArticleLive[]) {
      liveArticleMap[a.id] = a
    }
  }

  // 4. Curated playlists — published, ordered by display_order asc then updated_at desc
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

  // 5. Watch: approved videos by category (mix / live_set / music_video), published_at desc
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

  // 6. Recent published articles for the Read carousel
  const { data: articlesRaw } = await supabase
    .from('articles')
    .select('id, kind, title, slug, dek, excerpt, source_name, cover_image_url')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(10)

  const articles = (articlesRaw ?? []) as ArticleRead[]

  // Build slot_id → article lookup (Editor's Pick is the only article-backed slot we surface)
  const liveArticleBySlotId: Record<string, ArticleLive> = {}
  for (const item of liveItems) {
    if (item.article_id) {
      const art = liveArticleMap[item.article_id]
      if (art) liveArticleBySlotId[item.slot_id] = art
    }
  }

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

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/*
        Canonical 1–14 order. Mobile-only rows (Mobile*) wrap themselves in
        md:hidden; the real sections (Popular Playlists, Music Videos, Live
        Sets, Mixes, Read) render on both breakpoints. Responsive parity for
        the desktop ordering lands in Commit 2b.
      */}

      {/* 1. Hero */}
      <HeroCarousel items={SAMPLE_HERO_ITEMS} />

      {/* 2–6. Mobile-only Slice B intro */}
      <MobileGenrePills />
      <MobileBassMade />
      <MobileBassThisWeek />
      <MobileBassSets />
      <MobileArtistSpotlight />

      {/* 7. Popular Playlists (real) */}
      <CardCarousel title="Popular Playlists" items={playlistItems} rows={1} shape="square" className="mb-14" />

      {/* 8. Music Videos (real) */}
      <VideoCarousel title="Music Videos" items={musicVideoItems} className="mb-14" />

      {/* 9. Podcasts (mobile-only sample) */}
      <MobilePodcasts />

      {/* 10. Live Sets (real) */}
      <VideoCarousel title="Live Sets" items={liveSetItems} className="mb-14" />

      {/* 11. Mixes (real) */}
      <VideoCarousel title="Mixes" items={mixItems} className="mb-14" />

      {/* 12–13. Mobile-only Charts + Events */}
      <MobileCharts />
      <MobileEvents />

      {/* 14. Read (real, with Editor's Pick lead) */}
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

      {/* 15. Buy Merch (sample) */}
      <MobileMerch />

      {/* 16. Site footer */}
      <SiteFooter />
    </div>
  )
}
