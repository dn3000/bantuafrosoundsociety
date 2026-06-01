import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSpotifyPlaylistId } from '@/lib/spotify'
import { getSpotifyUserAccessToken } from '@/lib/integrations'

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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const url = body.url?.trim() || ''
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  const playlistId = extractSpotifyPlaylistId(url)
  if (!playlistId) {
    return NextResponse.json({ error: 'Invalid playlist URL' }, { status: 400 })
  }

  const token = await getSpotifyUserAccessToken()
  if (!token) {
    return NextResponse.json({ error: 'Spotify not connected' }, { status: 412 })
  }

  // Read integration row to inspect scope
  const { data: integration } = await supabase
    .from('integrations')
    .select('scope, provider_user_id, provider_display_name, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .maybeSingle()

  async function tryCall(label: string, urlToFetch: string) {
    const res = await fetch(urlToFetch, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const text = await res.text()
    return {
      label,
      url: urlToFetch,
      status: res.status,
      ok: res.ok,
      bodyPreview: text.slice(0, 400),
    }
  }

  const tests = await Promise.all([
    // 1. /me — confirms token works at all
    tryCall('user_me', 'https://api.spotify.com/v1/me'),
    // 2. /me/playlists — does user-scoped playlist listing work?
    tryCall('user_playlists', 'https://api.spotify.com/v1/me/playlists?limit=5'),
    // 3. Playlist metadata for the target playlist
    tryCall('playlist_meta', `https://api.spotify.com/v1/playlists/${playlistId}`),
    // 4. Playlist tracks — the failing endpoint
    tryCall('playlist_tracks', `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=10`),
    // 5. Same target as 4 but with explicit market parameter
    tryCall('playlist_tracks_market', `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=10&market=ZA`),
  ])

  return NextResponse.json({
    playlistId,
    integration: integration ? {
      scope: integration.scope,
      providerUserId: integration.provider_user_id,
      providerDisplayName: integration.provider_display_name,
      expiresAt: integration.expires_at,
    } : null,
    tests,
  })
}
