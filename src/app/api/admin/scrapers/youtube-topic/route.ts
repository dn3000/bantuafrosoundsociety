import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChannelById, getRecentUploads, uploadsPlaylistId } from '@/lib/youtube'

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

    let imagesBackfilled = 0
    let artistsScanned = 0
    let inserted = 0
    let duplicates = 0
    const errors: { artist: string; error: string }[] = []

    // --- Image backfill pass ---
    // Tracked artists that have at least one YouTube channel ID but no profile image.
    // Prefer OAC thumbnail; fall back to Topic thumbnail. Never overwrites an existing image.
    const { data: noImageArtists, error: imgErr } = await supabase
      .from('artists')
      .select('id, name, youtube_channel_id, youtube_topic_channel_id')
      .eq('is_tracked', true)
      .is('image_url', null)
      .or('youtube_channel_id.not.is.null,youtube_topic_channel_id.not.is.null')
    if (imgErr) return NextResponse.json({ error: imgErr.message }, { status: 500 })

    for (const row of noImageArtists ?? []) {
      const name = row.name as string
      const oacId = row.youtube_channel_id as string | null
      const topicId = row.youtube_topic_channel_id as string | null
      try {
        let thumbnail: string | null = null
        if (oacId) {
          const ch = await getChannelById(oacId)
          thumbnail = ch?.thumbnail ?? null
        }
        if (!thumbnail && topicId) {
          const ch = await getChannelById(topicId)
          thumbnail = ch?.thumbnail ?? null
        }
        if (thumbnail) {
          const { error: upErr } = await supabase
            .from('artists')
            .update({ image_url: thumbnail })
            .eq('id', row.id as string)
            .is('image_url', null) // guard: never overwrite an image set between fetch and update
          if (!upErr) imagesBackfilled++
          else errors.push({ artist: name, error: `image update: ${upErr.message}` })
        }
      } catch (e) {
        errors.push({ artist: name, error: `image backfill: ${e instanceof Error ? e.message : 'unknown'}` })
      }
    }

    // --- Release ingestion pass ---
    // Tracked artists with a resolved Topic channel. Derives the uploads playlist
    // via the UC→UU convention (0 extra API calls), then fetches the 25 most recent
    // uploads and inserts each as a pending submission for review.
    const { data: topicArtists, error: topicErr } = await supabase
      .from('artists')
      .select('id, name, youtube_topic_channel_id')
      .eq('is_tracked', true)
      .not('youtube_topic_channel_id', 'is', null)
    if (topicErr) return NextResponse.json({ error: topicErr.message }, { status: 500 })

    for (const row of topicArtists ?? []) {
      const artistId = row.id as string
      const name = row.name as string
      const topicId = row.youtube_topic_channel_id as string
      const playlistId = uploadsPlaylistId(topicId)
      if (!playlistId) continue
      artistsScanned++

      try {
        const uploads = await getRecentUploads(playlistId, 25)
        for (const upload of uploads) {
          if (!upload.videoId) continue

          // Dedup: skip if this video ID is already in submissions
          const { data: existing } = await supabase
            .from('submissions')
            .select('id')
            .eq('youtube_video_id', upload.videoId)
            .maybeSingle()
          if (existing) {
            duplicates++
            continue
          }

          const { error: insErr } = await supabase.from('submissions').insert({
            primary_artist_id: artistId,
            title: upload.title || 'Untitled',
            release_date: upload.publishedAt ? upload.publishedAt.slice(0, 10) : null,
            artwork_url: upload.thumbnail,
            type: 'single',
            source: 'youtube',
            source_url: `https://www.youtube.com/watch?v=${upload.videoId}`,
            source_method: 'youtube-topic',
            youtube_video_id: upload.videoId,
            status: 'pending',
          })

          if (insErr) {
            // 23505 = unique_violation (source_url or youtube_video_id conflict)
            if (insErr.code === '23505') {
              duplicates++
            } else {
              errors.push({ artist: name, error: insErr.message })
            }
          } else {
            inserted++
          }
        }
      } catch (e) {
        errors.push({ artist: name, error: `uploads: ${e instanceof Error ? e.message : 'unknown'}` })
      }
    }

    return NextResponse.json({ artistsScanned, imagesBackfilled, inserted, duplicates, errors })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
