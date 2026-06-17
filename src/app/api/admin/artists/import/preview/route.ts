import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylistMeta,
  fetchSpotifyPlaylistArtistsUserAuth,
  fetchSpotifyArtistsBulk,
} from '@/lib/spotify'
import { getSpotifyUserAccessToken } from '@/lib/integrations'

const MAX_PLAYLISTS = 10
const MAX_ARTISTS = 1000

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const userSpotifyToken = await getSpotifyUserAccessToken()
  if (!userSpotifyToken) {
    return NextResponse.json(
      { error: 'Spotify not connected. Go to Integrations and connect your Spotify account.' },
      { status: 412 }
    )
  }

  let body: { urls?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawUrls = Array.isArray(body.urls) ? body.urls : []
  if (rawUrls.length === 0) {
    return NextResponse.json({ error: 'At least one playlist URL required' }, { status: 400 })
  }
  if (rawUrls.length > MAX_PLAYLISTS) {
    return NextResponse.json({ error: `Max ${MAX_PLAYLISTS} playlists per import` }, { status: 400 })
  }

  const playlists: Array<{ url: string; id: string | null }> = rawUrls.map((u) => ({
    url: u,
    id: extractSpotifyPlaylistId(u),
  }))
  const invalid = playlists.filter((p) => !p.id).map((p) => p.url)
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Could not parse playlist URLs: ${invalid.join(', ')}` },
      { status: 400 }
    )
  }

  const playlistResults = await Promise.all(
    playlists.map(async (p) => {
      try {
        const meta = await fetchSpotifyPlaylistMeta(p.id!)
        const artists = await fetchSpotifyPlaylistArtistsUserAuth(p.id!, userSpotifyToken)
        return { ok: true as const, url: p.url, meta, artists }
      } catch (err) {
        return {
          ok: false as const,
          url: p.url,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    })
  )

  const failures = playlistResults.filter((r) => !r.ok)
  const successes = playlistResults.filter((r) => r.ok) as Array<{
    ok: true
    url: string
    meta: Awaited<ReturnType<typeof fetchSpotifyPlaylistMeta>>
    artists: Awaited<ReturnType<typeof fetchSpotifyPlaylistArtistsUserAuth>>
  }>

  const uniqueMap = new Map<string, { id: string; name: string; foundIn: string[] }>()
  for (const r of successes) {
    for (const a of r.artists) {
      const entry = uniqueMap.get(a.id)
      if (entry) {
        if (!entry.foundIn.includes(r.meta.name)) entry.foundIn.push(r.meta.name)
      } else {
        uniqueMap.set(a.id, { id: a.id, name: a.name, foundIn: [r.meta.name] })
      }
    }
  }

  const uniqueArtists = Array.from(uniqueMap.values())
  if (uniqueArtists.length > MAX_ARTISTS) {
    return NextResponse.json(
      { error: `Too many artists (${uniqueArtists.length}). Max ${MAX_ARTISTS} per import.` },
      { status: 400 }
    )
  }

  const spotifyIds = uniqueArtists.map((a) => a.id)
  const { data: existing } = await supabase
    .from('artists')
    .select('spotify_artist_id')
    .in('spotify_artist_id', spotifyIds)
  const existingSet = new Set((existing || []).map((row) => row.spotify_artist_id as string))

  let enriched: Awaited<ReturnType<typeof fetchSpotifyArtistsBulk>> = []
  try {
    enriched = await fetchSpotifyArtistsBulk(spotifyIds)
  } catch (err) {
    console.error('Bulk artist enrichment failed:', err)
  }
  const enrichedMap = new Map(enriched.map((e) => [e.id, e]))

  const preview = uniqueArtists.map((a) => {
    const e = enrichedMap.get(a.id)
    return {
      spotifyId: a.id,
      name: a.name,
      foundIn: a.foundIn,
      alreadyExists: existingSet.has(a.id),
      imageUrl: e?.imageUrl ?? null,
      genres: e?.genres ?? [],
      followers: e?.followers ?? 0,
      popularity: e?.popularity ?? 0,
    }
  })

  preview.sort((x, y) => {
    if (x.alreadyExists !== y.alreadyExists) return x.alreadyExists ? 1 : -1
    return (y.popularity || 0) - (x.popularity || 0)
  })

  return NextResponse.json({
    playlists: successes.map((r) => ({
      url: r.url,
      id: r.meta.id,
      name: r.meta.name,
      ownerName: r.meta.ownerName,
      trackCount: r.meta.trackCount,
      artistCount: r.artists.length,
    })),
    failures: failures.map((f) => ({ url: f.url, error: f.error })),
    artists: preview,
    totalUnique: uniqueArtists.length,
    totalExisting: existingSet.size,
    totalNew: uniqueArtists.length - existingSet.size,
  })
}
