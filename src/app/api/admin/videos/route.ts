import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// POST /api/admin/videos — manual insert from the paste-a-link flow.
// (Per-row edits / deletes live in ./[id]/route.ts.)
//
// Body: { youtube_video_id, title, category, status, is_exclusive,
//         artist_id|null, thumbnail_url|null, published_at|null }
// status is restricted to approved | pending (a pasted video either goes live
// or routes through the β review queue — never inserted as 'rejected').

const ALLOWED_CATEGORIES = ['mix', 'live_set', 'live_show', 'music_video', 'interview', 'other'] as const
const ALLOWED_STATUSES = ['approved', 'pending'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
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

  const youtubeVideoId = strOrNull(body.youtube_video_id)
  const title = strOrNull(body.title)
  if (!youtubeVideoId || !title) {
    return NextResponse.json({ error: 'youtube_video_id and title are required' }, { status: 400 })
  }

  if (!ALLOWED_CATEGORIES.includes(body.category as (typeof ALLOWED_CATEGORIES)[number])) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  if (!ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json({ error: 'status must be approved or pending' }, { status: 400 })
  }

  if (typeof body.is_exclusive !== 'boolean') {
    return NextResponse.json({ error: 'is_exclusive must be a boolean' }, { status: 400 })
  }

  const artistId = strOrNull(body.artist_id)
  if (artistId && !UUID_RE.test(artistId)) {
    return NextResponse.json({ error: 'artist_id must be a UUID or null' }, { status: 400 })
  }

  // Dedup pre-check (OAC pattern) so a duplicate returns a clean 409 instead of
  // a raw 23505.
  const { data: existing } = await supabase
    .from('videos')
    .select('id')
    .eq('youtube_video_id', youtubeVideoId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { video_id: existing.id, message: 'A video with this YouTube ID already exists.' },
      { status: 409 },
    )
  }

  const insertPayload = {
    youtube_video_id: youtubeVideoId,
    title,
    category: body.category as string,
    status: body.status as string,
    is_exclusive: body.is_exclusive,
    artist_id: artistId,
    thumbnail_url: strOrNull(body.thumbnail_url),
    published_at: strOrNull(body.published_at),
    source_method: 'paste',
  }

  const { data, error } = await supabase
    .from('videos')
    .insert(insertPayload)
    .select(
      'id, youtube_video_id, title, category, status, is_exclusive, artist_id, thumbnail_url, published_at, created_at',
    )
    .single()

  if (error) {
    // Race: a concurrent insert slipped in between the pre-check and this insert.
    if (error.code === '23505') {
      return NextResponse.json(
        { message: 'A video with this YouTube ID already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ video: data }, { status: 201 })
}
