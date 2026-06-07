import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSpotifyUrl, fetchSpotifyReleaseArtwork } from '@/lib/spotify'

const ALLOWED_TYPES = ['single', 'release', 'mix', 'dj_set', 'playlist', 'video', 'podcast'] as const
const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'deferred', 'needs_work'] as const
const ALLOWED_PRIORITIES = ['low', 'normal', 'high'] as const
const ALLOWED_SOURCES = ['spotify', 'apple_music', 'youtube', 'youtube_music', 'beatport', 'bandcamp', 'soundcloud', 'mixcloud', 'tidal', 'other'] as const
const ALLOWED_SORTS = ['created_at', 'release_date'] as const

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200
// Cap for "select all matching" id collection. The true total always comes from
// the exact count (so the UI shows the real number); `capped` flags the rare
// case where the queue exceeds this and not every id was returned.
const MAX_IDS = 5000
// Cap on how many artists a free-text artist search may resolve to.
const ARTIST_MATCH_CAP = 200

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const typeFilter = searchParams.get('type') || ''
  const source = searchParams.get('source') || ''
  const search = searchParams.get('search')?.trim() || ''
  const artistQuery = searchParams.get('artist')?.trim() || ''
  const sortParam = searchParams.get('sort') || 'created_at'
  const sort = (ALLOWED_SORTS as readonly string[]).includes(sortParam) ? sortParam : 'created_at'
  const idsOnly = searchParams.get('ids_only') === '1'
  const limit = Math.min(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10), MAX_LIMIT)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  // Artist search resolves names → ids, then filters submissions by
  // primary_artist_id. Two queries, but it sidesteps the fragility of
  // PostgREST embedded-resource filtering and keeps the count exact.
  let artistIds: string[] | null = null
  if (artistQuery) {
    const { data: artistRows, error: artistErr } = await supabase
      .from('artists')
      .select('id')
      .ilike('name', `%${artistQuery}%`)
      .limit(ARTIST_MATCH_CAP)
    if (artistErr) {
      return NextResponse.json({ error: artistErr.message }, { status: 500 })
    }
    artistIds = (artistRows ?? []).map((r) => r.id as string)
    // No artist matched → no submission can match. Short-circuit.
    if (artistIds.length === 0) {
      return NextResponse.json(
        idsOnly
          ? { ids: [], total: 0, capped: false }
          : { submissions: [], total: 0, limit, offset },
      )
    }
  }

  const statusOk = status && (ALLOWED_STATUSES as readonly string[]).includes(status)
  const typeOk = typeFilter && (ALLOWED_TYPES as readonly string[]).includes(typeFilter)
  const sourceOk = source && (ALLOWED_SOURCES as readonly string[]).includes(source)

  // "Select all matching" mode: return every matching id (up to MAX_IDS) plus
  // the true total, so the UI can act on the whole filtered set, not just the page.
  if (idsOnly) {
    let q = supabase.from('submissions').select('id', { count: 'exact' })
    if (statusOk) q = q.eq('status', status)
    if (typeOk) q = q.eq('type', typeFilter)
    if (sourceOk) q = q.eq('source', source)
    if (artistIds) q = q.in('primary_artist_id', artistIds)
    if (search) q = q.ilike('title', `%${search}%`)
    q = q.limit(MAX_IDS)
    const { data, error, count } = await q
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const ids = (data ?? []).map((r) => r.id as string)
    const total = count ?? 0
    return NextResponse.json({ ids, total, capped: total > ids.length })
  }

  // Note: joining primary_artist_id → artists relation
  let query = supabase
    .from('submissions')
    .select('*, artists!submissions_primary_artist_id_fkey(id, name, slug, image_url)', { count: 'exact' })

  if (statusOk) query = query.eq('status', status)
  if (typeOk) query = query.eq('type', typeFilter)
  if (sourceOk) query = query.eq('source', source)
  if (artistIds) query = query.in('primary_artist_id', artistIds)
  if (search) query = query.ilike('title', `%${search}%`)

  if (sort === 'release_date') {
    // Newest releases first; rows without a release_date sort last.
    query = query
      .order('release_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    submissions: data,
    total: count ?? 0,
    limit,
    offset,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const primaryArtistId = typeof body.artist_id === 'string' ? body.artist_id : null
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const type = typeof body.submission_type === 'string' ? body.submission_type : 'track'
  const sourceUrl = typeof body.url === 'string' ? body.url.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const coverImageUrl = typeof body.cover_image_url === 'string' ? body.cover_image_url.trim() : ''
  const artworkUrlFromBody = typeof body.artwork_url === 'string' ? body.artwork_url.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

  if (!primaryArtistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid submission_type' }, { status: 400 })
  }

  // source_url is required by schema; if user didn't provide URL, store a placeholder
  // (we can refine this later — the schema requires it but our manual form makes it optional)
  const effectiveSourceUrl = sourceUrl || `manual:${Date.now()}`

  // Detect Spotify track/album from the source URL so we can set the correct source value
  // and attempt to auto-fetch release artwork.
  const spotifyParsed = parseSpotifyUrl(effectiveSourceUrl)
  const derivedSource = spotifyParsed ? 'spotify' : 'other'

  const insertPayload: Record<string, unknown> = {
    type,
    source: derivedSource,
    source_url: effectiveSourceUrl,
    title,
    primary_artist_id: primaryArtistId,
    submitted_by: user.id,
    description: description || null,
    cover_image_url: coverImageUrl || null,
    notes: notes || null,
    source_method: 'manual',
    status: 'pending',
    priority: 'normal',
  }

  // Pass through an explicitly provided artwork_url from the request body.
  if (artworkUrlFromBody) {
    insertPayload.artwork_url = artworkUrlFromBody
  }

  // Auto-fetch release artwork from Spotify when source is spotify and the caller
  // did not already supply an artwork_url. Best-effort: any failure is logged and
  // swallowed so submission creation is never blocked.
  if (spotifyParsed && !artworkUrlFromBody) {
    try {
      const artworkUrl = await fetchSpotifyReleaseArtwork(spotifyParsed.type, spotifyParsed.id)
      if (artworkUrl) insertPayload.artwork_url = artworkUrl
    } catch (err) {
      console.error('[spotify-artwork] Failed to fetch artwork for', effectiveSourceUrl, err)
    }
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert(insertPayload)
    .select('*, artists!submissions_primary_artist_id_fkey(id, name, slug, image_url)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submission: data })
}
