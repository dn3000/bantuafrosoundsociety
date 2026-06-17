import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getRecentUploads, uploadsPlaylistId, categorizeVideo } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  try {
    const { supabase, error: authError } = await requireAdmin()
    if (authError) return authError

    let artistsScanned = 0
    let inserted = 0
    let duplicates = 0
    let skippedOfficialAudio = 0
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

          // Skip official audio — these are releases owned by the Topic channel,
          // not genuine Watch-lane content. Filter before the dedup query to save
          // a round-trip for every previously-seen official audio.
          if (/official\s*audio/i.test(upload.title || '')) {
            skippedOfficialAudio++
            continue
          }

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

    return NextResponse.json({ artistsScanned, inserted, duplicates, skippedOfficialAudio, byCategory, errors })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
