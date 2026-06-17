export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  EVENT_PUBLIC_COLUMNS,
  formatEventBadge,
  formatEventWhen,
} from '@/lib/events'

type EventDetail = {
  id: string
  slug: string
  title: string
  description: string | null
  event_date: string
  end_date: string | null
  venue: string | null
  city: string | null
  country: string | null
  lineup_artist_ids: string[] | null
  lineup_text: string | null
  ticket_url: string | null
  poster_url: string | null
  is_bass_recommended: boolean
  subgenres: string[] | null
}

type LineupArtist = {
  id: string
  slug: string
  name: string
  image_url: string | null
}

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function locationLine(ev: EventDetail): string {
  return [ev.venue, ev.city, ev.country].filter(Boolean).join(' · ')
}

async function fetchEvent(slug: string): Promise<EventDetail | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select(EVENT_PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return (data ?? null) as EventDetail | null
}

async function fetchLineup(ids: string[]): Promise<LineupArtist[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  // Public-readable columns only — `Public can read artists` policy lets anon
  // see all artists rows, but we still restrict to display columns.
  const { data } = await supabase
    .from('artists')
    .select('id, slug, name, image_url')
    .in('id', ids)
  const rows = (data ?? []) as LineupArtist[]
  // Preserve the curator's ordering rather than the DB's natural sort.
  const byId = new Map(rows.map((a) => [a.id, a]))
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is LineupArtist => !!a)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const ev = await fetchEvent(slug)
  if (!ev) return { title: 'Event not found | BASS' }
  const where = [ev.venue, ev.city].filter(Boolean).join(', ')
  const description =
    ev.description?.trim() ||
    [where, formatEventBadge(ev.event_date)].filter(Boolean).join(' · ') ||
    `${ev.title} on BASS`
  return {
    title: `${ev.title} | BASS`,
    description,
    openGraph: isRenderableImage(ev.poster_url)
      ? { images: [ev.poster_url!] }
      : undefined,
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ev = await fetchEvent(slug)
  if (!ev) notFound()

  const lineup = await fetchLineup(ev.lineup_artist_ids ?? [])
  const when = formatEventWhen(ev.event_date, ev.end_date)
  const where = locationLine(ev)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)] mb-8"
      >
        <span className="text-[var(--color-accent)]" aria-hidden>←</span>
        All events
      </Link>

      <section className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-10">
        <div className="sm:w-[400px] sm:flex-shrink-0">
          <div className="aspect-[3/4] w-full sm:max-w-[400px] rounded-[8px] overflow-hidden bg-[var(--color-bg-higher)]">
            {isRenderableImage(ev.poster_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ev.poster_url!}
                alt={ev.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-4xl select-none">
                {getInitials(ev.title)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {ev.is_bass_recommended && (
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
              BASS recommended
            </p>
          )}
          <h1
            className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-3"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {ev.title}
          </h1>
          {when && (
            <p className="text-[var(--color-fg-secondary)] text-sm mb-1">
              {when}
            </p>
          )}
          {where && (
            <p className="text-[var(--color-fg-secondary)] text-sm mb-5">
              {where}
            </p>
          )}

          {ev.ticket_url && (
            <a
              href={ev.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-4 py-2 transition-colors mb-6"
            >
              Get tickets ↗
            </a>
          )}

          {ev.subgenres && ev.subgenres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ev.subgenres.map((g) => (
                <span
                  key={g}
                  className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] border border-[var(--color-border-default)] rounded-full px-2 py-0.5"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {ev.description && (
        <section className="mb-10 max-w-2xl">
          <p className="text-[var(--color-fg-primary)] text-base leading-relaxed whitespace-pre-line">
            {ev.description}
          </p>
        </section>
      )}

      {(lineup.length > 0 || ev.lineup_text) && (
        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] mb-3">
            Lineup
          </h2>
          {lineup.length > 0 && (
            <ul className="flex flex-wrap gap-2 mb-2">
              {lineup.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/artist/${a.slug}`}
                    className="inline-flex items-center gap-2 bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-higher)] rounded-full pl-1 pr-3 py-1 text-sm text-[var(--color-fg-primary)] transition-colors"
                  >
                    {isRenderableImage(a.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image_url!}
                        alt={a.name}
                        className="w-7 h-7 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-fg-secondary)]">
                        {a.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '♪'}
                      </span>
                    )}
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {ev.lineup_text && (
            <p className="text-sm text-[var(--color-fg-secondary)] mt-2">
              {ev.lineup_text}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
