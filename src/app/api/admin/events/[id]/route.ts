import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  EVENT_STATUSES,
  isEventStatus,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('title' in body) {
    const v = strOrNull(body.title)
    if (!v) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    updates.title = v
  }

  if ('slug' in body) {
    const v = strOrNull(body.slug)
    if (!v) return NextResponse.json({ error: 'slug cannot be empty' }, { status: 400 })
    const normalized = slugify(v)
    if (!normalized) {
      return NextResponse.json({ error: 'slug is empty after normalization' }, { status: 400 })
    }
    const { data: collision, error: collErr } = await supabase
      .from('events')
      .select('id')
      .eq('slug', normalized)
      .neq('id', id)
      .maybeSingle()
    if (collErr) return NextResponse.json({ error: collErr.message }, { status: 500 })
    if (collision) {
      return NextResponse.json(
        { error: `slug "${normalized}" is already in use` },
        { status: 409 },
      )
    }
    updates.slug = normalized
  }

  if ('description' in body) updates.description = strOrNull(body.description)

  if ('event_date' in body) {
    const v = strOrNull(body.event_date)
    if (!v) {
      return NextResponse.json({ error: 'event_date is required' }, { status: 400 })
    }
    const utc = sastLocalToUtcIso(v)
    if (!utc) {
      return NextResponse.json(
        { error: 'event_date must be a SAST wall-clock value like "2026-07-12T20:00"' },
        { status: 400 },
      )
    }
    updates.event_date = utc
  }

  if ('end_date' in body) {
    const v = strOrNull(body.end_date)
    if (v === null) {
      updates.end_date = null
    } else {
      const utc = sastLocalToUtcIso(v)
      if (!utc) {
        return NextResponse.json(
          { error: 'end_date must be a SAST wall-clock value' },
          { status: 400 },
        )
      }
      updates.end_date = utc
    }
  }

  if ('venue' in body) updates.venue = strOrNull(body.venue)
  if ('city' in body) updates.city = strOrNull(body.city)
  if ('country' in body) {
    // Null country reverts to the column default on insert, but on UPDATE it
    // would persist NULL. Honour the admin's intent: null = blank country.
    updates.country = strOrNull(body.country)
  }

  if ('lineup_artist_ids' in body) {
    const ids = uuidArray(body.lineup_artist_ids)
    if (ids === null) {
      return NextResponse.json(
        { error: 'lineup_artist_ids must be an array of UUIDs' },
        { status: 400 },
      )
    }
    updates.lineup_artist_ids = ids
  }
  if ('lineup_text' in body) updates.lineup_text = strOrNull(body.lineup_text)

  for (const field of ['ticket_url', 'poster_url', 'source_url'] as const) {
    if (field in body) {
      const v = strOrNull(body[field])
      if (v && !isValidHttpUrl(v)) {
        return NextResponse.json(
          { error: `${field} must be a valid http(s) URL` },
          { status: 400 },
        )
      }
      updates[field] = v
    }
  }

  if ('is_bass_recommended' in body) {
    if (typeof body.is_bass_recommended !== 'boolean') {
      return NextResponse.json(
        { error: 'is_bass_recommended must be a boolean' },
        { status: 400 },
      )
    }
    updates.is_bass_recommended = body.is_bass_recommended
  }

  if ('subgenres' in body) {
    const arr = stringArray(body.subgenres)
    if (arr === null) {
      return NextResponse.json(
        { error: 'subgenres must be an array of strings' },
        { status: 400 },
      )
    }
    updates.subgenres = arr
  }

  if ('status' in body) {
    if (!isEventStatus(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${EVENT_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }
    updates.status = body.status
  }

  if ('notes' in body) updates.notes = strOrNull(body.notes)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select(ADMIN_SELECT)
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === 'PGRST116' ? 404 : 500 },
    )
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
