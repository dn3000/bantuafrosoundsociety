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
  spotify_artist_id: string | null
}

type Release = {
  id: string
  title: string
  type: string
  release_date: string | null
  artwork_url: string | null
  cover_image_url: string | null
  source_url: string
  embed_url: string | null
  artists: Artist | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  single: 'SINGLE',
  release: 'ALBUM',
  mix: 'MIX',
  playlist: 'PLAYLIST',
  video: 'VIDEO',
  podcast: 'PODCAST',
  dj_set: 'DJ SET',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getArtworkSrc(release: Release): string | null {
  if (isRenderableImage(release.artwork_url)) return release.artwork_url!
  if (isRenderableImage(release.cover_image_url)) return release.cover_image_url!
  if (isRenderableImage(release.artists?.image_url)) return release.artists!.image_url!
  return null
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// release_date is a DATE ("YYYY-MM-DD"); parse parts directly to avoid UTC drift.
function formatMonthYear(dateStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const monthIdx = Number(m[2]) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return `${MONTH_NAMES[monthIdx]} ${m[1]}`
}

async function fetchRelease(id: string): Promise<Release | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('submissions')
    .select(
      'id, title, type, release_date, artwork_url, cover_image_url, source_url, embed_url, artists(id, name, image_url, spotify_artist_id)'
    )
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle()

  if (!data) return null
  return data as unknown as Release
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const release = await fetchRelease(id)
  if (!release) {
    return { title: 'Release not found | BASS' }
  }
  const artistName = release.artists?.name ?? 'Unknown Artist'
  return {
    title: `${release.title} — ${artistName} | BASS`,
    description: `Listen to ${release.title} by ${artistName} on BASS.`,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Artwork({ release }: { release: Release }) {
  const src = getArtworkSrc(release)
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={release.title}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    )
  }
  return (
    <div className="w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-3xl select-none">
      {getInitials(release.title)}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const release = await fetchRelease(id)
  if (!release) notFound()

  const typeLabel = TYPE_LABELS[release.type] ?? release.type.toUpperCase()
  const monthYear = release.release_date ? formatMonthYear(release.release_date) : null
  const metaLine = monthYear ? `${typeLabel} · ${monthYear}` : typeLabel
  const hasEmbed = !!release.embed_url && release.embed_url.trim().length > 0

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
        {/* Artwork */}
        <div className="sm:w-[400px] sm:flex-shrink-0">
          <div className="aspect-square w-full sm:max-w-[400px] rounded-[8px] overflow-hidden">
            <Artwork release={release} />
          </div>
        </div>

        {/* Metadata */}
        <div className="flex-1 flex flex-col">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
            {typeLabel}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2">
            {release.title}
          </h1>
          {release.artists && (
            <p className="text-[var(--color-fg-secondary)] text-lg mb-4">
              {release.artists.name}
            </p>
          )}
          <p className="text-xs uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-6">
            {metaLine}
          </p>

          {release.source_url && (
            <a
              href={release.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]"
            >
              Listen on Spotify ↗
            </a>
          )}
        </div>
      </section>

      {/* Spotify embed */}
      {hasEmbed && release.embed_url && (
        <section className="rounded-[8px] overflow-hidden">
          <iframe
            src={release.embed_url}
            width="100%"
            height="380"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block w-full rounded-[8px] overflow-hidden"
            title={`${release.title} on Spotify`}
          />
        </section>
      )}
    </div>
  )
}
