import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveYouTubeChannelsBySpotifyIds } from '@/lib/wikidata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: adminCheck } = await supabase.rpc('is_admin')
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: candidates, error: fetchErr } = await supabase
      .from('artists')
      .select('id, spotify_artist_id')
      .not('spotify_artist_id', 'is', null)
      .is('youtube_channel_id', null)

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const rows = candidates ?? []
    const checked = rows.length

    if (checked === 0) {
      return NextResponse.json({ checked: 0, resolved: 0, stillUnresolved: 0 })
    }

    const spotifyIds = rows.map((r) => r.spotify_artist_id as string)
    const resolvedMap = await resolveYouTubeChannelsBySpotifyIds(spotifyIds)

    let resolved = 0
    for (const row of rows) {
      const ytId = resolvedMap.get(row.spotify_artist_id as string)
      if (!ytId) continue

      const { error: upErr } = await supabase
        .from('artists')
        .update({ youtube_channel_id: ytId })
        .eq('id', row.id as string)
        .is('youtube_channel_id', null) // guard against concurrent writes

      if (!upErr) resolved++
    }

    return NextResponse.json({ checked, resolved, stillUnresolved: checked - resolved })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
