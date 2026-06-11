import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchChannel } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Each YouTube search call costs 100 quota units; daily limit ~10,000 units.
// Cap at 80 searches per run to leave headroom for other operations.
const CAP = 80

export async function POST() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: adminCheck } = await supabase.rpc('is_admin')
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Count total unresolved before we pick the batch (for remainingUnresolved reporting).
    const { count: totalUnresolved } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .is('youtube_topic_channel_id', null)

    // Prioritize tracked artists; secondary priority: has OAC or Spotify ID.
    // Supabase doesn't support multi-column ordering with nullable boolean well,
    // so fetch slightly more than CAP and sort in JS to honour the priority.
    const { data: candidates, error: fetchErr } = await supabase
      .from('artists')
      .select('id, name, is_tracked, youtube_channel_id, spotify_artist_id')
      .is('youtube_topic_channel_id', null)
      .limit(CAP * 2) // over-fetch so JS sort can apply the secondary criterion

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    type Row = {
      id: unknown
      name: unknown
      is_tracked: unknown
      youtube_channel_id: unknown
      spotify_artist_id: unknown
    }

    const sorted = ((candidates ?? []) as Row[]).sort((a, b) => {
      const ta = a.is_tracked ? 1 : 0
      const tb = b.is_tracked ? 1 : 0
      if (ta !== tb) return tb - ta
      const ha = a.youtube_channel_id || a.spotify_artist_id ? 1 : 0
      const hb = b.youtube_channel_id || b.spotify_artist_id ? 1 : 0
      return hb - ha
    })

    const rows = sorted.slice(0, CAP)
    const checked = rows.length
    let resolved = 0
    let searchesUsed = 0

    for (const row of rows) {
      const name = row.name as string
      const id = row.id as string

      try {
        const results = await searchChannel(`${name} topic`)
        searchesUsed++

        const topicMatch = results.find((r) => r.title.endsWith(' - Topic'))
        if (topicMatch?.channelId) {
          const { error: upErr } = await supabase
            .from('artists')
            .update({ youtube_topic_channel_id: topicMatch.channelId })
            .eq('id', id)
            .is('youtube_topic_channel_id', null) // guard against concurrent writes

          if (!upErr) resolved++
        }
      } catch {
        // skip this artist — transient error, will be retried next run
      }
    }

    const remainingUnresolved = Math.max(0, (totalUnresolved ?? 0) - resolved)
    return NextResponse.json({ checked, resolved, searchesUsed, remainingUnresolved })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
