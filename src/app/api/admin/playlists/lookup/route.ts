import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePlaylistId, getPlaylistMetadata } from '@/lib/spotifyPlaylist'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const input = typeof body.input === 'string' ? body.input.trim() : ''
  if (!input) return NextResponse.json({ error: 'input is required' }, { status: 400 })

  const playlistId = parsePlaylistId(input)
  if (!playlistId) {
    return NextResponse.json(
      { error: 'Could not parse a Spotify playlist id from that input' },
      { status: 400 }
    )
  }

  const meta = await getPlaylistMetadata(playlistId)
  if (!meta) {
    return NextResponse.json(
      { error: 'Could not fetch playlist metadata from Spotify' },
      { status: 502 }
    )
  }

  return NextResponse.json({ playlistId, ...meta })
}
