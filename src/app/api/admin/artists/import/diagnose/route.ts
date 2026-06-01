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
    return NextResponse.json({ error: 'Could not parse playlist ID from URL' }, { status: 400 })
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

  const directRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const directBody = await directRes.text()

  return NextResponse.json({
    playlistId,
    isEditorial,
    tokenAcquired: true,
    spotifyStatus: directRes.status,
    spotifyBodyPreview: directBody.slice(0, 500),
    note: isEditorial
      ? 'This ID has the 37i9dQZF1 prefix, which indicates a Spotify-curated editorial playlist. As of late 2024, these are no longer accessible via Client Credentials auth — use user-created playlists instead.'
      : 'This appears to be a user-created playlist; Client Credentials access should work.',
  })
}
