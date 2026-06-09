import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSpotifyPlaylistId, fetchSpotifyPlaylistMeta, type SpotifyPlaylistMeta } from '@/lib/spotify'

// Add a Spotify playlist to the tracked list. Paste a playlist URL/URI/id; we
// parse the id, fetch name/description/image/owner from Spotify, and insert the
// row. Admin-gated by is_admin() RLS (the INSERT fails WITH CHECK for non-admins)
// — no bespoke user_roles read.
export const runtime = 'nodejs' // fetchSpotifyPlaylistMeta -> getAccessToken uses Buffer

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const url = typeof body.url === 'string' ? body.url : ''
  const playlistId = extractSpotifyPlaylistId(url)
  if (!playlistId) {
    return NextResponse.json({ error: 'Could not parse a Spotify playlist id from that input' }, { status: 400 })
  }

  // Already tracked? Return the existing row rather than erroring on the unique id.
  const { data: existing } = await supabase
    .from('tracked_playlists')
    .select('*')
    .eq('spotify_playlist_id', playlistId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ playlist: existing, alreadyExists: true })
  }

  let meta: SpotifyPlaylistMeta
  try {
    meta = await fetchSpotifyPlaylistMeta(playlistId)
  } catch (err) {
    return NextResponse.json(
      { error: `Spotify: ${err instanceof Error ? err.message : 'playlist fetch failed'}` },
      { status: 502 }
    )
  }

  const { data, error } = await supabase
    .from('tracked_playlists')
    .insert({
      spotify_playlist_id: playlistId,
      name: meta.name,
      description: meta.description,
      image_url: meta.imageUrl,
      owner_name: meta.ownerName,
      added_by: user.id,
    })
    .select('*')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ playlist: data }, { status: 201 })
}
