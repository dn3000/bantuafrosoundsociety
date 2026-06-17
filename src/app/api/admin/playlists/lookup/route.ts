import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { parsePlaylistId, getPlaylistMetadata, getPlaylistOEmbed } from '@/lib/spotifyPlaylist'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const input = typeof body.input === 'string' ? body.input.trim() : ''
  if (!input) return NextResponse.json({ error: 'input is required' }, { status: 400 })

  // 1. Parse the ID — hard error on bad input
  const spotifyPlaylistId = parsePlaylistId(input)
  if (!spotifyPlaylistId) {
    return NextResponse.json(
      { error: 'Not a valid Spotify playlist link' },
      { status: 400 }
    )
  }

  // 2. Try Spotify Web API (client-credentials). Editorial playlists often
  //    return 403/404 here; getPlaylistMetadata returns null rather than throwing.
  const meta = await getPlaylistMetadata(spotifyPlaylistId)

  // 3. oEmbed fallback / supplement. Works for editorial playlists and requires
  //    no auth. If Web API gave us a cover image we keep it; oEmbed fills gaps.
  const oembed = await getPlaylistOEmbed(spotifyPlaylistId)

  if (!meta && !oembed) {
    // Valid Spotify playlist id, but neither source returned usable data.
    // Still return the parsed id so the admin can save with a manual title.
    return NextResponse.json({
      spotifyPlaylistId,
      error: "Couldn't fetch metadata — enter title manually",
    })
  }

  // Merge: Web API wins for fields it provides; oEmbed fills any gaps.
  return NextResponse.json({
    spotifyPlaylistId,
    title: meta?.title || oembed?.title || '',
    coverImageUrl: meta?.coverImageUrl || oembed?.coverImageUrl || null,
    curatorName: meta?.curatorName ?? null,
    description: meta?.description ?? null,
    trackCount: meta?.trackCount ?? 0,
  })
}
