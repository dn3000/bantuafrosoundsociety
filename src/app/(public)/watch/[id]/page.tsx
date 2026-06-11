export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

// ── Types ─────────────────────────────────────────────────────────────────────

type Artist = {
  id: string
  name: string
  image_url: string | null
}

type Video = {
  id: string
  youtube_video_id: string
  title: string
  category: string
  published_at: string | null
  thumbnail_url: string | null
  artists: Artist | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  mix: 'Mix',
  live_set: 'Live Set',
  music_video: 'Music Video',
  interview: 'Interview',
  other: 'Other',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPublishedDate(dt: string): string {
  const d = new Date(dt)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '▶'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

async function fetchVideo(id: string): Promise<Video | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('videos')
    .select('id, youtube_video_id, title, category, published_at, thumbnail_url, artists(id, name, image_url)')
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!data) return null
  return data as unknown as Video
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const video = await fetchVideo(id)
  if (!video) return { title: 'Video not found | BASS' }
  const artistName = video.artists?.name ?? 'Unknown Artist'
  const catLabel = CATEGORY_LABELS[video.category] ?? video.category
  return {
    title: `${video.title} — ${artistName} | BASS`,
    description: `Watch ${catLabel.toLowerCase()} by ${artistName} on BASS.`,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VideoThumbnail({ video }: { video: Video }) {
  if (video.thumbnail_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={video.thumbnail_url}
        alt={video.title}
        className="w-full h-full object-cover"
        loading="eager"
      />
    )
  }
  return (
    <div className="w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-3xl select-none">
      {getInitials(video.title)}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const video = await fetchVideo(id)
  if (!video) notFound()

  const catLabel = CATEGORY_LABELS[video.category] ?? video.category
  const pubDate = video.published_at ? formatPublishedDate(video.published_at) : null
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/watch"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)] mb-8"
      >
        <span className="text-[var(--color-accent)]" aria-hidden>←</span>
        Back to Watch
      </Link>

      {/* Hero — thumbnail left, metadata right; stacked on mobile */}
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-10">
        {/* Thumbnail — 16:9 */}
        <div className="sm:w-[400px] sm:flex-shrink-0">
          <div className="aspect-video w-full sm:max-w-[400px] rounded-[8px] overflow-hidden">
            <VideoThumbnail video={video} />
          </div>
        </div>

        {/* Metadata */}
        <div className="flex-1 flex flex-col">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
            {catLabel}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2">
            {video.title}
          </h1>
          {video.artists && (
            <p className="text-[var(--color-fg-secondary)] text-lg mb-2">
              {video.artists.name}
            </p>
          )}
          {pubDate && (
            <p className="text-xs uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-6">
              {pubDate}
            </p>
          )}

          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]"
          >
            Watch on YouTube ↗
          </a>
        </div>
      </section>

      {/* Responsive 16:9 YouTube embed */}
      <section className="rounded-[8px] overflow-hidden">
        <div className="relative aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${video.youtube_video_id}`}
            className="absolute inset-0 w-full h-full"
            style={{ border: 0 }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={video.title}
          />
        </div>
      </section>
    </div>
  )
}
