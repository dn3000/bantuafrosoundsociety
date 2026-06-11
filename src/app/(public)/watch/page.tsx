export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { VideoCard, type VideoCarouselItem } from '@/components/VideoCarousel'

export const metadata: Metadata = {
  title: 'Watch | BASS',
  description: 'Mixes, live sets, music videos, and interviews from the BASS community.',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type VideoRow = {
  id: string
  title: string
  thumbnail_url: string | null
  category: string
  published_at: string | null
  artists: { name: string } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Display order for category sections.
const CATEGORY_ORDER = ['music_video', 'mix', 'live_set', 'live_show', 'interview', 'other'] as const
type WatchCategory = (typeof CATEGORY_ORDER)[number]

const SECTION_LABELS: Record<WatchCategory, string> = {
  music_video: 'Music Videos',
  mix: 'Mixes',
  live_set: 'Live Sets',
  live_show: 'Live Shows',
  interview: 'Interviews',
  other: 'Other',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toItems(rows: VideoRow[]): VideoCarouselItem[] {
  return rows.map((v) => ({
    id: v.id,
    title: v.title,
    artist: v.artists?.name ?? null,
    category: v.category,
    thumbnail_url: v.thumbnail_url,
    href: `/watch/${v.id}`,
  }))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WatchPage() {
  const supabase = await createClient()

  const VIDEO_COLS = 'id, title, thumbnail_url, category, published_at, artists(name)'
  const ORDER_OPTS = { ascending: false, nullsFirst: false } as const

  // Parallel queries — one per category, limit 24 each.
  const [musicVideosR, mixesR, liveSetsR, liveShowsR, interviewsR, otherR] = await Promise.all([
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'music_video').order('published_at', ORDER_OPTS).limit(24),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'mix').order('published_at', ORDER_OPTS).limit(24),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'live_set').order('published_at', ORDER_OPTS).limit(24),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'live_show').order('published_at', ORDER_OPTS).limit(24),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'interview').order('published_at', ORDER_OPTS).limit(24),
    supabase.from('videos').select(VIDEO_COLS).eq('status', 'approved').eq('category', 'other').order('published_at', ORDER_OPTS).limit(24),
  ])

  const sections: Record<WatchCategory, VideoCarouselItem[]> = {
    music_video: toItems((musicVideosR.data ?? []) as unknown as VideoRow[]),
    mix: toItems((mixesR.data ?? []) as unknown as VideoRow[]),
    live_set: toItems((liveSetsR.data ?? []) as unknown as VideoRow[]),
    live_show: toItems((liveShowsR.data ?? []) as unknown as VideoRow[]),
    interview: toItems((interviewsR.data ?? []) as unknown as VideoRow[]),
    other: toItems((otherR.data ?? []) as unknown as VideoRow[]),
  }

  const hasAny = CATEGORY_ORDER.some((c) => sections[c].length > 0)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Page header */}
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-fg-primary)] mb-2">
          Watch
        </h1>
        <p className="text-sm text-[var(--color-fg-secondary)]">
          Mixes, live sets, music videos, and more from the BASS community.
        </p>
      </header>

      {!hasAny && (
        <div className="text-center py-20">
          <p className="text-[var(--color-fg-tertiary)] text-sm mb-4">No videos available yet.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors"
          >
            <span className="text-[var(--color-accent)]" aria-hidden>←</span>
            Back to home
          </Link>
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const items = sections[cat]
        if (items.length === 0) return null
        return (
          <section key={cat} className="mb-14">
            {/* "→ SECTION TITLE" style matching the homepage */}
            <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-6 flex items-center gap-1.5">
              <span className="text-[var(--color-accent)]" aria-hidden>→</span>
              {SECTION_LABELS[cat]}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <VideoCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
