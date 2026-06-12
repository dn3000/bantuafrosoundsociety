import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Cap for "select all matching" id collection. The true total always comes from
// the exact count (so the UI shows the real number); `capped` flags the rare
// case where the filtered set exceeds this and not every id was returned.
const MAX_IDS = 5000

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() || ''
  const tier = searchParams.get('tier') || ''
  const tracked = searchParams.get('tracked') || ''
  const idsOnly = searchParams.get('ids_only') === '1'
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
  const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
  const tierOk = tier === 'featured' || tier === 'active' || tier === 'watch'
  // Sort modes. Default = recently updated (existing behaviour).
  // scanned_asc_nulls_first = least-recently-scanned first (nulls = "never
  // scanned", which naturally surface for retry); the scrapers UI surfaces
  // this so the next bulk run can prioritise stale artists.
  const sort = searchParams.get('sort') || 'updated_desc'

  // "Select all matching" mode: return every matching id (up to MAX_IDS) plus the
  // true total, so the UI can act on the whole filtered set, not just the page.
  // Filters MUST match the list query below exactly, or the count would lie.
  if (idsOnly) {
    let q = supabase.from('artists').select('id', { count: 'exact' })
    if (search) q = q.ilike('name', `%${search}%`)
    if (tierOk) q = q.eq('tier', tier)
    if (tracked === 'true') q = q.eq('is_tracked', true)
    else if (tracked === 'false') q = q.eq('is_tracked', false)
    q = q.limit(MAX_IDS)
    const { data, error, count } = await q
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const ids = (data ?? []).map((r) => r.id as string)
    const total = count ?? 0
    return NextResponse.json({ ids, total, capped: total > ids.length })
  }

  let query = supabase
    .from('artists')
    .select(
      'id, name, slug, tier, status, is_tracked, country, city, subgenres, image_url, updated_at, last_scanned_at, spotify_artist_id, youtube_topic_channel_id, youtube_channel_id',
      { count: 'exact' },
    )
    .range(offset, offset + limit - 1)

  if (sort === 'scanned_asc_nulls_first') {
    // Never-scanned (NULL) artists float to the top so the next bulk run picks
    // them up first; among scanned artists, oldest first.
    query = query.order('last_scanned_at', { ascending: true, nullsFirst: true })
  } else {
    query = query.order('updated_at', { ascending: false })
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  if (tierOk) {
    query = query.eq('tier', tier)
  }
  if (tracked === 'true') {
    query = query.eq('is_tracked', true)
  } else if (tracked === 'false') {
    query = query.eq('is_tracked', false)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artists: data ?? [], total: count ?? 0, limit, offset })
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const baseSlug = slugify(name)
  const suffix = Math.random().toString(36).slice(2, 6)
  const slug = baseSlug ? `${baseSlug}-${suffix}` : `artist-${suffix}`

  const allowedTiers = ['featured', 'active', 'watch']
  const allowedStatuses = ['active', 'inactive', 'hiatus']

  const insertPayload: Record<string, unknown> = {
    name,
    slug,
    tier: allowedTiers.includes(body.tier as string) ? body.tier : 'active',
    status: allowedStatuses.includes(body.status as string) ? body.status : 'active',
    is_tracked: body.is_tracked === true,
    country: typeof body.country === 'string' ? body.country.trim() || null : null,
    city: typeof body.city === 'string' ? body.city.trim() || null : null,
    subgenres: Array.isArray(body.subgenres) ? body.subgenres.filter((s) => typeof s === 'string') : [],
    bio: typeof body.bio === 'string' ? body.bio.trim() || null : null,
    image_url: typeof body.image_url === 'string' ? body.image_url.trim() || null : null,
    spotify_artist_id: typeof body.spotify_artist_id === 'string' ? body.spotify_artist_id.trim() || null : null,
    private_notes: typeof body.private_notes === 'string' ? body.private_notes.trim() || null : null,
    added_by: user.id,
  }

  const { data, error } = await supabase
    .from('artists')
    .insert(insertPayload)
    .select('id, slug, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artist: data }, { status: 201 })
}
