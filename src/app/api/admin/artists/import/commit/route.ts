import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchSpotifyArtistsBulk } from '@/lib/spotify'

const MAX_IMPORT = 1000
const ALLOWED_TIERS = ['featured', 'active', 'watch']
const ALLOWED_STATUSES = ['active', 'inactive', 'hiatus']

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    spotifyIds?: string[]
    tier?: string
    status?: string
    isTracked?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = Array.isArray(body.spotifyIds) ? body.spotifyIds.filter((s) => typeof s === 'string') : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'No artists selected' }, { status: 400 })
  }
  if (ids.length > MAX_IMPORT) {
    return NextResponse.json({ error: `Max ${MAX_IMPORT} per import` }, { status: 400 })
  }

  const tier = ALLOWED_TIERS.includes(body.tier as string) ? (body.tier as string) : 'watch'
  const status = ALLOWED_STATUSES.includes(body.status as string) ? (body.status as string) : 'active'
  const isTracked = body.isTracked === true

  const { data: existing } = await supabase
    .from('artists')
    .select('spotify_artist_id')
    .in('spotify_artist_id', ids)
  const existingSet = new Set((existing || []).map((row) => row.spotify_artist_id as string))
  const newIds = ids.filter((id) => !existingSet.has(id))

  if (newIds.length === 0) {
    return NextResponse.json({ imported: 0, skipped: ids.length, message: 'All selected artists already exist' })
  }

  let spotifyArtists: Awaited<ReturnType<typeof fetchSpotifyArtistsBulk>>
  try {
    spotifyArtists = await fetchSpotifyArtistsBulk(newIds)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Spotify bulk fetch failed' },
      { status: 502 }
    )
  }

  const usedSlugs = new Set<string>()
  const rows = spotifyArtists.map((a) => {
    let base = slugify(a.name)
    if (!base) base = 'artist'
    let candidate = base
    let counter = 1
    while (usedSlugs.has(candidate)) {
      counter++
      candidate = `${base}-${counter}`
    }
    candidate = `${candidate}-${Math.random().toString(36).slice(2, 6)}`
    usedSlugs.add(candidate)

    return {
      name: a.name,
      slug: candidate,
      spotify_artist_id: a.id,
      image_url: a.imageUrl,
      spotify_genres: a.genres,
      country: 'South Africa',
      tier,
      status,
      is_tracked: isTracked,
      source_method: 'bulk_import',
      added_by: user.id,
    }
  })

  const { data: inserted, error } = await supabase
    .from('artists')
    .insert(rows)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    imported: inserted?.length ?? 0,
    skipped: existingSet.size,
  })
}
