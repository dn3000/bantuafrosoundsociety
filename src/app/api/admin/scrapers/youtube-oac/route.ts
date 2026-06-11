import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRecentUploads, uploadsPlaylistId, categorizeVideo } from '@/lib/youtube'

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

    let artistsScanned = 0
    let inserted = 0
    let duplicates = 0
    const byCategory = { mix: 0, live_set: 0, music_video: 0, interview: 0, other: 0 }
    const errors: { artist: string; error: string }[] = []

    const { data: oacArtists, error: artistsErr } = await supabase
      .from('artists')
      .select('id, name, youtube_channel_id')
      .eq('is_tracked', true)
      .not('youtube_channel_id', 'is', null)
    if (artistsErr) return NextResponse.json({ error: artistsErr.message }, { status: 500 })

    for (const row of oacArtists ?? []) {
      const artistId = row.id as string
      const name = row.name as string
      const channelId = row.youtube_channel_id as string
      const playlistId = uploadsPlaylistId(channelId)
      if (!playlistId) continue
      artistsScanned++

      try {
        const uploads = await getRecentUploads(playlistId, 25)
        for (const upload of uploads) {
          if (!upload.videoId) continue

          // Dedup: skip if this video ID is already in videos
          const { data: existing } = await supabase
            .from('videos')
            .select('id')
            .eq('youtube_video_id', upload.videoId)
            .maybeSingle()
          if (existing) {
            duplicates++
            continue
          }

          const category = categorizeVideo(upload.title || '')
          const { error: insErr } = await supabase.from('videos').insert({
            artist_id: artistId,
            youtube_video_id: upload.videoId,
            title: upload.title || 'Untitled',
            category,
            published_at: upload.publishedAt || null,
            thumbnail_url: upload.thumbnail,
            status: 'pending',
            source_method: 'youtube-oac',
          })

          if (insErr) {
            if (insErr.code === '23505') {
              duplicates++
            } else {
              errors.push({ artist: name, error: insErr.message })
            }
          } else {
            inserted++
            byCategory[category]++
          }
        }
      } catch (e) {
        errors.push({ artist: name, error: `uploads: ${e instanceof Error ? e.message : 'unknown'}` })
      }
    }

    return NextResponse.json({ artistsScanned, inserted, duplicates, byCategory, errors })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
