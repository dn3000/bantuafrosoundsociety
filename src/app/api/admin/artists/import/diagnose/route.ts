import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSpotifyPlaylistId, getAccessToken } from '@/lib/spotify'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const url = body.url?.trim() || ''
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  const playlistId = extractSpotifyPlaylistId(url)
  if (!playlistId) {
    return NextResponse.json({ error: 'Could not parse playlist ID' }, { status: 400 })
  }

  const isEditorial = playlistId.startsWith('37i9dQZF1')

  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    return NextResponse.json({
      playlistId,
      isEditorial,
      tokenAcquired: false,
      tokenError: err instanceof Error ? err.message : 'Unknown',
    })
  }

  async function tryCall(label: string, urlToFetch: string) {
    const res = await fetch(urlToFetch, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const bodyText = await res.text()
    return {
      label,
      url: urlToFetch,
      status: res.status,
      ok: res.ok,
      bodyPreview: bodyText.slice(0, 400),
    }
  }

  const results = await Promise.all([
    tryCall('A_meta_no_fields', `https://api.spotify.com/v1/playlists/${playlistId}`),
    tryCall(
      'B_meta_with_fields',
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),tracks(total)`
    ),
    tryCall(
      'C_tracks_with_fields',
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(artists(id,name))),next&limit=100&offset=0`
    ),
    tryCall(
      'D_tracks_no_fields',
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=0`
    ),
  ])

  return NextResponse.json({
    playlistId,
    isEditorial,
    tokenAcquired: true,
    tests: results,
    note: 'A/B compare meta with vs without fields param. C/D compare tracks endpoint same way.',
  })
}
