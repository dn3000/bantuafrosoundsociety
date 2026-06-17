import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { CHART_SOURCES, type ChartKey } from '@/lib/shazam'

// Admin GET / POST for the charts table.
//
// GET ?chart_key=...&status=draft|published|all
//   Returns rows ordered by position. status defaults to 'all'.
//   Each row carries an `artist` join (resolved via the soft artist_id link)
//   so the admin can show "matched to roster" pill.
//
// POST (manual entry — source='manual')
//   { chart_key, title, artist_name, artwork_url?, apple_music_url?, artist_id? }
//   Inserted as status='draft' so manual rows go through the same
//   refresh→edit→publish flow as Shazam imports.

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

function flattenArtist(a: RawRow['artist']): ArtistJoin | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function rowOut(r: RawRow) {
  return { ...r, artist: flattenArtist(r.artist) }
}

function isChartKey(v: unknown): v is ChartKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHART_SOURCES, v)
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const chartKey = searchParams.get('chart_key')
  const statusParam = searchParams.get('status') ?? 'all'

  if (!isChartKey(chartKey)) {
    return NextResponse.json(
      { error: `Unknown chart_key (allowed: ${Object.keys(CHART_SOURCES).join(', ')})` },
      { status: 400 },
    )
  }

  let q = supabase
    .from('charts')
    .select(ROW_SELECT)
    .eq('chart_key', chartKey)
    .order('status', { ascending: true })
    .order('position', { ascending: true })

  if (statusParam === 'draft' || statusParam === 'published') {
    q = q.eq('status', statusParam)
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as RawRow[]
  const items = rows.map(rowOut)

  return NextResponse.json({
    chart_key: chartKey,
    label: CHART_SOURCES[chartKey].label,
    items,
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

  if (!isChartKey(body.chart_key)) {
    return NextResponse.json(
      { error: `Unknown chart_key (allowed: ${Object.keys(CHART_SOURCES).join(', ')})` },
      { status: 400 },
    )
  }

  const title = strOrNull(body.title)
  const artistName = strOrNull(body.artist_name)
  if (!title || !artistName) {
    return NextResponse.json(
      { error: 'title and artist_name are required' },
      { status: 400 },
    )
  }

  const artistId = strOrNull(body.artist_id)
  if (artistId && !UUID_RE.test(artistId)) {
    return NextResponse.json({ error: 'artist_id must be a UUID' }, { status: 400 })
  }

  // Next position within the draft set for this chart_key.
  const { data: maxRow } = await supabase
    .from('charts')
    .select('position')
    .eq('chart_key', body.chart_key)
    .eq('status', 'draft')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (maxRow?.position ?? 0) + 1

  const insertPayload = {
    chart_key: body.chart_key,
    source: 'manual',
    position: nextPosition,
    title,
    artist_name: artistName,
    artwork_url: strOrNull(body.artwork_url),
    apple_music_url: strOrNull(body.apple_music_url),
    isrc: strOrNull(body.isrc),
    external_id: null,
    artist_id: artistId,
    status: 'draft' as const,
    captured_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('charts')
    .insert(insertPayload)
    .select(ROW_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: rowOut(data as unknown as RawRow) }, { status: 201 })
}
