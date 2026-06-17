export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  EVENT_PUBLIC_COLUMNS,
  formatEventBadge,
  formatEventDateLong,
  formatEventTime,
} from '@/lib/events'

export const metadata: Metadata = {
  title: 'Events | BASS',
  description: 'Upcoming live shows and parties on the BASS calendar.',
}

type EventCard = {
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

function locationLine(ev: EventCard): string {
  return [ev.venue, ev.city, ev.country].filter(Boolean).join(' · ')
}

export default async function EventsIndexPage() {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  // status='published' alone would leak past events (the 'past' status is
  // admin-set, not auto-derived). event_date >= now() is the right filter.
  const { data } = await supabase
    .from('events')
    .select(EVENT_PUBLIC_COLUMNS)
    .eq('status', 'published')
    .gte('event_date', nowIso)
    .order('event_date', { ascending: true })

  const events = (data ?? []) as EventCard[]

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1
          className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] mb-2"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Events
        </h1>
        <p className="text-sm text-[var(--color-fg-secondary)]">
          Upcoming live shows on the BASS calendar.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 sm:p-14 text-center">
          <p className="text-base text-[var(--color-fg-primary)] mb-1">
            No upcoming events right now.
          </p>
          <p className="text-sm text-[var(--color-fg-secondary)]">
            Check back soon — we&apos;re always lining up the next one.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/events/${ev.slug}`}
                className="group block bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] overflow-hidden hover:bg-[var(--color-bg-higher)] transition-colors duration-[var(--animate-default)] motion-safe:hover:-translate-y-[2px] motion-safe:hover:shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
              >
                <div className="relative aspect-[3/4] w-full bg-[var(--color-bg-higher)]">
                  {isRenderableImage(ev.poster_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ev.poster_url!}
                      alt={ev.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-3xl select-none">
                      {getInitials(ev.title)}
                    </div>
                  )}
                  <span className="absolute top-3 left-3 inline-block text-[10px] font-semibold uppercase tracking-wider text-white border border-white/40 rounded-full px-2 py-0.5 bg-black/45 backdrop-blur-sm">
                    {formatEventBadge(ev.event_date)}
                  </span>
                  {ev.is_bass_recommended && (
                    <span className="absolute top-3 right-3 inline-block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] border border-[var(--color-accent)] rounded-full px-2 py-0.5 bg-black/45 backdrop-blur-sm">
                      BASS pick
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="text-base font-semibold text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)] transition-colors line-clamp-2">
                    {ev.title}
                  </h2>
                  <p className="text-xs text-[var(--color-fg-secondary)] mt-1.5">
                    {formatEventDateLong(ev.event_date)} · {formatEventTime(ev.event_date)} SAST
                  </p>
                  {locationLine(ev) && (
                    <p className="text-xs text-[var(--color-fg-tertiary)] mt-0.5 line-clamp-1">
                      {locationLine(ev)}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
