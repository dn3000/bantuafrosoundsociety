import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  EVENT_STATUSES,
  isEventStatus,
  nextFreeSlug,
  sastLocalToUtcIso,
} from '@/lib/events'
import { slugify } from '@/lib/slugify'

const ADMIN_SELECT =
  'id, slug, title, description, event_date, end_date, venue, city, country, lineup_artist_ids, lineup_text, ticket_url, poster_url, source_url, is_bass_recommended, subgenres, status, notes, created_at, updated_at'

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

function uuidArray(v: unknown): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string') return null
    const t = item.trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
      return null
    }
    out.push(t)
  }
  return out
}

function stringArray(v: unknown): string[] | null {
  if (v == null) return []
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string') return null
    const t = item.trim()
    if (t) out.push(t)
  }
  return out
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Admins see every row (draft/published/cancelled/past). Public surfaces use
// their own queries with status='published' AND event_date >= now().
export async function GET() {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { data, error } = await supabase
    .from('events')
    .select(ADMIN_SELECT)
    .order('event_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = strOrNull(body.title)
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const eventDateLocal = strOrNull(body.event_date)
  if (!eventDateLocal) {
    return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
  }
  const eventDateUtc = sastLocalToUtcIso(eventDateLocal)
  if (!eventDateUtc) {
    return NextResponse.json(
      { error: 'event_date must be a SAST wall-clock value like "2026-07-12T20:00"' },
      { status: 400 },
    )
  }

  const endDateLocal = strOrNull(body.end_date)
  let endDateUtc: string | null = null
  if (endDateLocal) {
    endDateUtc = sastLocalToUtcIso(endDateLocal)
    if (!endDateUtc) {
      return NextResponse.json(
        { error: 'end_date must be a SAST wall-clock value' },
        { status: 400 },
      )
    }
  }

  const status = body.status ?? 'draft'
  if (!isEventStatus(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${EVENT_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }

  const lineupIds = uuidArray(body.lineup_artist_ids)
  if (lineupIds === null) {
    return NextResponse.json(
      { error: 'lineup_artist_ids must be an array of UUIDs' },
      { status: 400 },
    )
  }
  const subgenres = stringArray(body.subgenres)
  if (subgenres === null) {
    return NextResponse.json(
      { error: 'subgenres must be an array of strings' },
      { status: 400 },
    )
  }

  // URL fields are optional but, when present, must be http(s).
  for (const field of ['ticket_url', 'poster_url', 'source_url'] as const) {
    const v = strOrNull(body[field])
    if (v && !isValidHttpUrl(v)) {
      return NextResponse.json(
        { error: `${field} must be a valid http(s) URL` },
        { status: 400 },
      )
    }
  }

  // Slug: if the admin supplied one, validate + check collision (409). Otherwise
  // derive from the title and append -2/-3/… until free. Either way, we read
  // the current slug set once and pick a unique candidate.
  const requestedSlug = strOrNull(body.slug)
  const { data: slugRows, error: slugErr } = await supabase
    .from('events')
    .select('slug')
  if (slugErr) {
    return NextResponse.json({ error: slugErr.message }, { status: 500 })
  }
  const taken = new Set<string>((slugRows ?? []).map((r) => r.slug as string))

  let slug: string
  if (requestedSlug) {
    const normalized = slugify(requestedSlug)
    if (!normalized) {
      return NextResponse.json({ error: 'slug is empty after normalization' }, { status: 400 })
    }
    if (taken.has(normalized)) {
      return NextResponse.json(
        { error: `slug "${normalized}" is already in use` },
        { status: 409 },
      )
    }
    slug = normalized
  } else {
    slug = nextFreeSlug(title, taken)
  }

  const insertPayload: Record<string, unknown> = {
    title,
    slug,
    event_date: eventDateUtc,
    end_date: endDateUtc,
    description: strOrNull(body.description),
    venue: strOrNull(body.venue),
    city: strOrNull(body.city),
    // country has a DB default of 'South Africa' — null lets it apply.
    country: strOrNull(body.country),
    lineup_artist_ids: lineupIds,
    lineup_text: strOrNull(body.lineup_text),
    ticket_url: strOrNull(body.ticket_url),
    poster_url: strOrNull(body.poster_url),
    source_url: strOrNull(body.source_url),
    is_bass_recommended: body.is_bass_recommended === true,
    subgenres,
    status,
    notes: strOrNull(body.notes),
  }
  // Drop null values for fields that have meaningful defaults (country) so
  // the DB default applies instead of NULL clobbering it.
  if (insertPayload.country === null) delete insertPayload.country

  const { data, error } = await supabase
    .from('events')
    .insert(insertPayload)
    .select(ADMIN_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
