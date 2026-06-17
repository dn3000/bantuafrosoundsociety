import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// PATCH /api/admin/charts/:id  — edit a single draft row's editable fields.
// DELETE /api/admin/charts/:id — drop a draft row.
//
// Editable: position, title, artist_name, artwork_url, apple_music_url,
// artist_id (UUID or null to clear).

const ROW_SELECT = `
  id, chart_key, source, position, title, artist_name, artwork_url,
  apple_music_url, isrc, external_id, artist_id, status, captured_at,
  created_at, updated_at,
  artist:artists!artist_id(id, slug, name, image_url)
`

type ArtistJoin = { id: string; slug: string; name: string; image_url: string | null }
type RawRow = {
  id: string
  chart_key: string
  source: string
  position: number
  title: string
  artist_name: string
  artwork_url: string | null
  apple_music_url: string | null
  isrc: string | null
  external_id: string | null
  artist_id: string | null
  status: 'draft' | 'published'
  captured_at: string | null
  created_at: string
  updated_at: string
  artist: ArtistJoin | ArtistJoin[] | null
}

function rowOut(r: RawRow) {
  const a = r.artist
  return { ...r, artist: Array.isArray(a) ? (a[0] ?? null) : a }
}

function strOrNull(v: unknown): string | null {
  if (v === null) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  if ('position' in body) {
    if (typeof body.position !== 'number' || !Number.isInteger(body.position)) {
      return NextResponse.json({ error: 'position must be an integer' }, { status: 400 })
    }
    updates.position = body.position
  }

  if ('title' in body) {
    const t = strOrNull(body.title)
    if (!t) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    }
    updates.title = t
  }

  if ('artist_name' in body) {
    const t = strOrNull(body.artist_name)
    if (!t) {
      return NextResponse.json({ error: 'artist_name cannot be empty' }, { status: 400 })
    }
    updates.artist_name = t
  }

  if ('artwork_url' in body) {
    updates.artwork_url = strOrNull(body.artwork_url)
  }

  if ('apple_music_url' in body) {
    updates.apple_music_url = strOrNull(body.apple_music_url)
  }

  if ('artist_id' in body) {
    if (body.artist_id === null) {
      updates.artist_id = null
    } else {
      const v = strOrNull(body.artist_id)
      if (!v || !UUID_RE.test(v)) {
        return NextResponse.json({ error: 'artist_id must be a UUID or null' }, { status: 400 })
      }
      updates.artist_id = v
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('charts')
    .update(updates)
    .eq('id', id)
    .select(ROW_SELECT)
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === 'PGRST116' ? 404 : 500 },
    )
  }

  return NextResponse.json({ item: rowOut(data as unknown as RawRow) })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  const { error } = await supabase.from('charts').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
