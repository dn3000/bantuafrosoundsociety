import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// Admin CRUD for homepage video "picks" (ride-above curation).
//   GET    ?rail_key=…        list picks for a rail, ordered by position
//   POST   { rail_key, video_id, position? }  pin an approved video (default
//                                             position = max+1 in the rail)
//   PATCH  { id, position }   reorder one pick
//   DELETE ?id=…              unpin one pick

const RAIL_KEYS = ['exclusive_sets', 'bass_sets', 'music_videos', 'podcasts', 'live_sets', 'mixes'] as const
type RailKey = (typeof RAIL_KEYS)[number]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRailKey(v: unknown): v is RailKey {
  return typeof v === 'string' && (RAIL_KEYS as readonly string[]).includes(v)
}

const PICK_SELECT = `
  id, rail_key, video_id, position,
  video:videos!inner(id, title, thumbnail_url, category, status, is_exclusive, artists(name))
`

type RawPick = Record<string, unknown> & { video?: unknown }

function flattenPick(p: RawPick) {
  const v = p.video
  return { ...p, video: Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
}

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const railKey = searchParams.get('rail_key')
  if (!isRailKey(railKey)) {
    return NextResponse.json({ error: 'Unknown rail_key' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('video_picks')
    .select(PICK_SELECT)
    .eq('rail_key', railKey)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    rail_key: railKey,
    picks: (data ?? []).map((p) => flattenPick(p as RawPick)),
  })
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

  if (!isRailKey(body.rail_key)) {
    return NextResponse.json({ error: 'Unknown rail_key' }, { status: 400 })
  }
  const videoId = typeof body.video_id === 'string' ? body.video_id.trim() : ''
  if (!UUID_RE.test(videoId)) {
    return NextResponse.json({ error: 'video_id must be a UUID' }, { status: 400 })
  }

  // Only approved videos can be pinned — a pending/rejected video must not ride
  // the homepage.
  const { data: video, error: vErr } = await supabase
    .from('videos')
    .select('id, status')
    .eq('id', videoId)
    .maybeSingle()
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (video.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved videos can be pinned. Approve it first, then pin.' },
      { status: 409 },
    )
  }

  let position: number
  if (typeof body.position === 'number' && Number.isInteger(body.position)) {
    position = body.position
  } else {
    const { data: maxRow } = await supabase
      .from('video_picks')
      .select('position')
      .eq('rail_key', body.rail_key)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    position = (maxRow?.position ?? 0) + 1
  }

  const { data, error } = await supabase
    .from('video_picks')
    .insert({ rail_key: body.rail_key, video_id: videoId, position })
    .select('id, rail_key, video_id, position')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This video is already pinned to that rail.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pick: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 })
  }
  if (typeof body.position !== 'number' || !Number.isInteger(body.position)) {
    return NextResponse.json({ error: 'position must be an integer' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('video_picks')
    .update({ position: body.position })
    .eq('id', id)
    .select('id, rail_key, video_id, position')
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === 'PGRST116' ? 404 : 500 },
    )
  }
  return NextResponse.json({ pick: data })
}

export async function DELETE(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const id = (searchParams.get('id') ?? '').trim()
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 })
  }

  const { error } = await supabase.from('video_picks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
