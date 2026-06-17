import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

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

type IncomingArtist = {
  spotifyId: string
  name: string
  imageUrl: string | null
  genres: string[]
}

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: {
    artists?: IncomingArtist[]
    tier?: string
    status?: string
    isTracked?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const incoming = Array.isArray(body.artists) ? body.artists : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No artists provided' }, { status: 400 })
  }
  if (incoming.length > MAX_IMPORT) {
    return NextResponse.json({ error: `Max ${MAX_IMPORT} per import` }, { status: 400 })
  }

  // Sanitize
  const cleaned: IncomingArtist[] = incoming
    .filter((a) => typeof a?.spotifyId === 'string' && typeof a?.name === 'string')
    .map((a) => ({
      spotifyId: a.spotifyId,
      name: a.name.trim(),
      imageUrl: typeof a.imageUrl === 'string' ? a.imageUrl : null,
      genres: Array.isArray(a.genres) ? a.genres.filter((g) => typeof g === 'string') : [],
    }))

  if (cleaned.length === 0) {
    return NextResponse.json({ error: 'No valid artists in payload' }, { status: 400 })
  }

  const tier = ALLOWED_TIERS.includes(body.tier as string) ? (body.tier as string) : 'watch'
  const status = ALLOWED_STATUSES.includes(body.status as string) ? (body.status as string) : 'active'
  const isTracked = body.isTracked === true

  // Skip any that already exist
  const spotifyIds = cleaned.map((a) => a.spotifyId)
  const { data: existing } = await supabase
    .from('artists')
    .select('spotify_artist_id')
    .in('spotify_artist_id', spotifyIds)
  const existingSet = new Set((existing || []).map((row) => row.spotify_artist_id as string))
  const newArtists = cleaned.filter((a) => !existingSet.has(a.spotifyId))

  if (newArtists.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: cleaned.length,
      message: 'All selected artists already exist',
    })
  }

  // Build insert rows
  const usedSlugs = new Set<string>()
  const rows = newArtists.map((a) => {
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
      spotify_artist_id: a.spotifyId,
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
