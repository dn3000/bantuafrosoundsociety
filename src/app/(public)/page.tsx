export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CardCarousel, type CarouselItem } from '@/components/CardCarousel'
import type { MediaCardItem } from '@/components/MediaCardRow'
import { VideoCarousel, type VideoCarouselItem } from '@/components/VideoCarousel'
import { HeroCarousel, type HeroCarouselItem } from '@/components/HeroCarousel'
import { resolveHeroItems, type HeroItemRow } from '@/lib/hero'
import {
  MobileGenrePills,
  MobileBassMade,
  MobileBassThisWeek,
  MobileArtistSpotlight,
  MobileCharts,
  MobileEvents,
  MobileMerch,
} from '@/components/MobileHomeSections'
import { SiteFooter } from '@/components/SiteFooter'

// ── Hero formatting ───────────────────────────────────────────────────────────
// "05 June 2026" — matches the "en-GB" + day '2-digit' convention used on the
// Read page header. Returns '' for null/invalid so the carousel falls back to
// blank metadata instead of "Invalid Date".
function formatHeroDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

// resolver ref_type → HeroCarouselItem.type literal. HeroCarousel doesn't
// branch on this field, but the type still demands one of the four literals,
// so every submission (any subtype) collapses to 'release'.
const REF_TYPE_TO_CAROUSEL: Record<HeroItemRow['ref_type'], HeroCarouselItem['type']> = {
  submission: 'release',
  video: 'video',
  playlist: 'playlist',
  article: 'article',
}

// "Durban · Gqom" / "South Africa · Afro House". City wins; missing city falls
// back to country (so an artist whose city equals their country, e.g. "South
// Africa", renders as a single token — we pick one, never concatenate).
// Subgenre is subgenres[0] (curated first = main). Returns "" if neither part
// exists, in which case the card shows just the name.
function buildSpotlightDescriptor(artist: {
  city: string | null
  country: string | null
  subgenres: string[] | null
}): string {
  const city = artist.city?.trim() ?? ''
  const country = artist.country?.trim() ?? ''
  const location = city || country
  const subgenre = artist.subgenres?.[0]?.trim() ?? ''
  return [location, subgenre].filter(Boolean).join(' · ')
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CuratedPlaylist = {
  id: string
  spotify_playlist_id: string
  name: string | null
  curator_name: string | null
  cover_image_url: string | null
  image_url: string | null
}

type BassMadePlaylist = {
  id: string
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

type SpotlightArtistRow = {
  id: string
  name: string
  image_url: string | null
  city: string | null
  country: string | null
  subgenres: string[] | null
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

  // 0. Hero items — RLS only returns is_published=true rows for anon.
  const { data: heroRowsRaw } = await supabase
    .from('hero_items')
    .select('id, position, ref_type, ref_id, kicker, headline, is_published, created_at, updated_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  const heroRows = (heroRowsRaw ?? []) as HeroItemRow[]
  const heroResolved = heroRows.length ? await resolveHeroItems(supabase, heroRows) : []
  // Drop items whose ref vanished (admin can still see them in /admin/hero
  // flagged "ref missing") and items missing an image — the hero is image-led.
  const heroItems: HeroCarouselItem[] = heroResolved
    .filter((r) => !r.refMissing && r.imageUrl)
    .map((r) => ({
      id: r.id,
      type: REF_TYPE_TO_CAROUSEL[r.ref_type],
      kicker: r.kicker ?? '',
      headline: r.headline ?? r.title,
      imageUrl: r.imageUrl as string,
      typeBadge: r.typeBadge,
      title: r.title,
      artist: r.subtitle ?? '',
      date: formatHeroDate(r.date),
      href: r.href,
    }))

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

  // 4. Curated playlists — split into BASS-made (in-house) and the rest. Both
  // queries hit tracked_playlists with disjoint is_bass_made filters so no
  // playlist appears in both rows.
  const [{ data: bassMadeRaw }, { data: playlistsRaw }] = await Promise.all([
    supabase
      .from('tracked_playlists')
      .select('id, name, curator_name, cover_image_url, image_url')
      .eq('is_published', true)
      .eq('is_bass_made', true)
      .order('display_order', { ascending: true })
      .order('updated_at', { ascending: false }),
    supabase
      .from('tracked_playlists')
      .select('id, spotify_playlist_id, name, curator_name, cover_image_url, image_url')
      .eq('is_published', true)
      .eq('is_bass_made', false)
      .order('display_order', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(12),
  ])

  const bassMade = (bassMadeRaw ?? []) as BassMadePlaylist[]
  const playlists = (playlistsRaw ?? []) as CuratedPlaylist[]

  // MediaCardItem.imageUrl is non-nullable — drop rows missing both image fields.
  const bassMadeItems: MediaCardItem[] = bassMade
    .map((pl): MediaCardItem | null => {
      const imageUrl = pl.cover_image_url ?? pl.image_url
      if (!imageUrl) return null
      const curator = pl.curator_name?.trim()
      return {
        id: pl.id,
        title: pl.name ?? 'Untitled Playlist',
        subtitle: curator ? `${curator} · BASS` : 'BASS',
        imageUrl,
        href: `/playlist/${pl.id}`,
      }
    })
    .filter((it): it is MediaCardItem => it !== null)

  const playlistItems: CarouselItem[] = playlists.map((pl) => ({
    id: pl.id,
    label: 'PLAYLIST',
    cover_image_url: pl.cover_image_url,
    artist_image_url: pl.image_url,
    title: pl.name ?? 'Untitled Playlist',
    subtitle: pl.curator_name,
    href: `/playlist/${pl.id}`,
  }))

  // 4b. Artist Spotlight — hand-curated picks. limit(24) is generous because
  // the list is editorial (admins rarely exceed ~12). Nulls-last on
  // spotlight_order lets freshly-added rows (no order yet) sort to the end
  // instead of leaping to the front.
  const { data: spotlightRaw } = await supabase
    .from('artists')
    .select('id, name, image_url, city, country, subgenres')
    .eq('is_spotlight', true)
    .order('spotlight_order', { ascending: true, nullsFirst: false })
    .limit(24)

  const spotlightArtists = (spotlightRaw ?? []) as SpotlightArtistRow[]
  // href omitted on purpose — there's no public artist detail page yet, so
  // MediaCardRow renders these as non-interactive divs (no nav, no pointer
  // cursor). Add href back once the read-only page lands.
  const spotlightItems: MediaCardItem[] = spotlightArtists
    .map((a): MediaCardItem | null => {
      if (!a.image_url) return null
      return {
        id: a.id,
        title: a.name,
        subtitle: buildSpotlightDescriptor(a) || undefined,
        imageUrl: a.image_url,
      }
    })
    .filter((it): it is MediaCardItem => it !== null)

  // 5. Watch: approved videos by category (mix / live_set / music_video), published_at desc
  const VIDEO_COLS = 'id, title, thumbnail_url, category, published_at, artists(name)'
  const VIDEO_ORDER = { ascending: false, nullsFirst: false } as const

  const [
    { data: mixVideosRaw },
    { data: liveSetVideosRaw },
    { data: musicVideoVideosRaw },
    { data: interviewVideosRaw },
    { data: liveShowVideosRaw },
    { data: exclusiveSetVideosRaw },
  ] = await Promise.all([
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'mix').order('published_at', VIDEO_ORDER).limit(12),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'live_set').eq('is_exclusive', false).order('published_at', VIDEO_ORDER).limit(12),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'music_video').order('published_at', VIDEO_ORDER).limit(12),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'interview').order('published_at', VIDEO_ORDER).limit(12),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'live_show').eq('is_exclusive', false).order('published_at', VIDEO_ORDER).limit(12),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('is_exclusive', true).order('published_at', VIDEO_ORDER).limit(12),
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
  const podcastItems = toVideoItems((interviewVideosRaw ?? []) as unknown as VideoRow[])
  const bassSetItems = toVideoItems((liveShowVideosRaw ?? []) as unknown as VideoRow[])
  const exclusiveSetItems = toVideoItems((exclusiveSetVideosRaw ?? []) as unknown as VideoRow[])

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
    <>
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/*
        Canonical 1–14 order. The sample sections render at both breakpoints
        with mobile-vw / desktop-pixel sizing; the real sections (Popular
        Playlists, Music Videos, Live Sets, Mixes, Read) also render at both
        widths. SiteFooter (16) sits outside this max-w-5xl column so its
        terracotta band can full-bleed the layout's content area.
      */}

      {/* 1. Hero — only renders when admins have published at least one item. */}
      {heroItems.length > 0 && <HeroCarousel items={heroItems} />}

      {/* 2–6. Mobile-only Slice B intro */}
      <MobileGenrePills />
      <MobileBassMade items={bassMadeItems} />
      <MobileBassThisWeek />
      {/* Exclusive Sets (real, fed by videos.is_exclusive=true) */}
      <VideoCarousel title="Exclusive Sets" items={exclusiveSetItems} className="mb-14" />
      {/* 5. BASS Sets (real, fed by videos category=live_show) */}
      <VideoCarousel title="BASS Sets" items={bassSetItems} className="mb-14" />
      <MobileArtistSpotlight items={spotlightItems} />

      {/* 7. Popular Playlists (real) */}
      <CardCarousel title="Popular Playlists" items={playlistItems} rows={1} shape="square" className="mb-14" />

      {/* 8. Music Videos (real) */}
      <VideoCarousel title="Music Videos" items={musicVideoItems} className="mb-14" />

      {/* 9. Podcasts (real, fed by videos category=interview) */}
      <VideoCarousel title="Podcasts" items={podcastItems} className="mb-14" />

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
    </div>

    {/* 16. Site footer — full-bleed terracotta, outside the content column */}
    <SiteFooter />
    </>
  )
}
