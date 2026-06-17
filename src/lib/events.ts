// Shared helpers for the Events pillar — kept in lib so the admin API,
// admin UI, and public pages all share one source of truth for SAST
// conversion, slug shaping, and the public column allowlist.

import { slugify } from './slugify'

// South Africa is SAST = UTC+02:00 year-round (no DST). datetime-local form
// inputs come back as "YYYY-MM-DDTHH:mm" with no timezone — admins are
// promised those wall-clock fields mean SAST, so we append the offset and
// let Date parse it. Returns a UTC ISO string ready for TIMESTAMPTZ.
export const SAST_OFFSET = '+02:00'

export function sastLocalToUtcIso(local: string): string | null {
  const trimmed = local.trim()
  if (!trimmed) return null
  // Accept "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${SAST_OFFSET}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

// UTC ISO from the DB → "YYYY-MM-DDTHH:mm" SAST wall-clock string suitable
// for prefilling a datetime-local input. Inverse of sastLocalToUtcIso.
export function utcIsoToSastLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Use the Africa/Johannesburg formatter to pull the wall-clock components.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

// Strict, public-safe column allowlist. promoter_contact_id, venue_contact_id,
// notes, and source_url are NEVER selected on a public surface.
export const EVENT_PUBLIC_COLUMNS =
  'id, slug, title, description, event_date, end_date, venue, city, country, lineup_artist_ids, lineup_text, ticket_url, poster_url, is_bass_recommended, subgenres' as const

// Status values accepted by the events_status_check constraint.
export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'past'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === 'string' && (EVENT_STATUSES as readonly string[]).includes(v)
}

// Find the next available slug given a base and the slugs already in use.
// "summer-jam" → "summer-jam", "summer-jam-2", "summer-jam-3", …
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || 'event'
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}-${n}`)) n += 1
  return `${root}-${n}`
}

// SAST date/time formatters used by the public surfaces. Date-only goes in
// the homepage badge pill (e.g. "12 Jul"); date+time goes on the detail page.
const SAST = 'Africa/Johannesburg'

export function formatEventBadge(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST, day: 'numeric', month: 'short',
  }).format(d).toUpperCase()
}

export function formatEventDateLong(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST,
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d)
}

export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

// "Saturday, 12 July 2026 · 20:00–23:00 SAST" / single-time when no end_date.
export function formatEventWhen(eventDate: string, endDate: string | null): string {
  const date = formatEventDateLong(eventDate)
  const start = formatEventTime(eventDate)
  if (!date || !start) return ''
  if (!endDate) return `${date} · ${start} SAST`
  // If end falls on the same SAST calendar day, render only the time range.
  const sameDay = formatEventDateLong(endDate) === date
  const end = formatEventTime(endDate)
  if (sameDay && end) return `${date} · ${start}–${end} SAST`
  if (end) return `${date} · ${start} SAST → ${formatEventDateLong(endDate)} · ${end} SAST`
  return `${date} · ${start} SAST`
}
