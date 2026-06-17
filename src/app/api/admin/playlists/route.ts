import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

const COLUMNS =
  'id, spotify_playlist_id, name, curator_name, description, cover_image_url, image_url, owner_name, is_published, is_bass_made, display_order, track_count, is_active, last_scanned_at, created_at, updated_at'

export async function GET() {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { data, error } = await supabase
    .from('tracked_playlists')
    .select(COLUMNS)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ playlists: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const spotifyPlaylistId =
    typeof body.spotifyPlaylistId === 'string' ? body.spotifyPlaylistId.trim() : ''
  if (!spotifyPlaylistId) {
    return NextResponse.json({ error: 'spotifyPlaylistId is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tracked_playlists')
    .insert({
      spotify_playlist_id: spotifyPlaylistId,
      name: typeof body.name === 'string' ? body.name.trim() || null : null,
      curator_name: typeof body.curatorName === 'string' ? body.curatorName.trim() || null : null,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      cover_image_url:
        typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() || null : null,
      is_published: body.isPublished !== false,
      is_bass_made: body.isBassMade === true,
      display_order: typeof body.displayOrder === 'number' ? body.displayOrder : 0,
      added_by: user.id,
    })
    .select(COLUMNS)
    .single()
  if (error) {
    const msg =
      error.code === '23505'
        ? 'A playlist with that Spotify id is already tracked.'
        : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }

  return NextResponse.json({ playlist: data }, { status: 201 })
}
