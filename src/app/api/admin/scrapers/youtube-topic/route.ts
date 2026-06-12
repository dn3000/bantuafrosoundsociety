import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChannelById, getRecentUploads, uploadsPlaylistId } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: adminCheck } = await supabase.rpc('is_admin')
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Body params: limit (max artists for the release ingestion pass, default 20),
    // trackedOnly (default false, but tracked artists always run first).
    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* no body = use defaults */ }
    const limit = typeof body.limit === 'number'
      ? Math.min(Math.max(Math.round(body.limit), 1), 100)
      : 20
    const trackedOnly = body.trackedOnly === true

    let imagesBackfilled = 0
    let artistsScanned = 0
    let inserted = 0
    let duplicates = 0
    const errors: { artist: string; error: string }[] = []
    const artistsProcessed: { name: string; inserted: number; duplicates: number }[] = []

    // --- Image backfill pass ---
    // Tracked artists that have at least one YouTube channel ID but no usable profile image.
    // Treats image_url as missing when it is null OR an empty/whitespace string.
    // Prefer OAC (high-res) thumbnail; fall back to Topic thumbnail. Never overwrites a real image.
    const { data: noImageArtists, error: imgErr } = await supabase
      .from('artists')
      .select('id, name, image_url, youtube_channel_id, youtube_topic_channel_id')
      .eq('is_tracked', true)
      .or('youtube_channel_id.not.is.null,youtube_topic_channel_id.not.is.null')
    if (imgErr) return NextResponse.json({ error: imgErr.message }, { status: 500 })

    for (const row of noImageArtists ?? []) {
      // Skip artists that already have a real image (null AND empty/whitespace are treated as missing)
      if ((row.image_url as string | null)?.trim()) continue

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
          // Guard: only write if image_url is still null or empty — prevents overwriting a
          // concurrently-set real image. Covers both null and '' via the OR filter.
          const { error: upErr } = await supabase
            .from('artists')
            .update({ image_url: thumbnail })
            .eq('id', row.id as string)
            .or('image_url.is.null,image_url.eq.')
          if (!upErr) imagesBackfilled++
          else errors.push({ artist: name, error: `image update: ${upErr.message}` })
        }
      } catch (e) {
        errors.push({ artist: name, error: `image backfill: ${e instanceof Error ? e.message : 'unknown'}` })
      }
    }

    // --- Release ingestion pass ---
    // Select candidates: artists with a Topic channel, skipping those already
    // ingested (≥1 existing youtube-topic submission). Tracked artists run first
    // so each run advances to the next un-ingested batch in priority order.

    // Collect already-ingested artist IDs so we can skip them.
    const { data: ingestedRows } = await supabase
      .from('submissions')
      .select('primary_artist_id')
      .eq('source_method', 'youtube-topic')
    const ingestedIds = new Set<string>(
      (ingestedRows ?? [])
        .map((r) => r.primary_artist_id as string)
        .filter(Boolean),
    )

    let candidateQuery = supabase
      .from('artists')
      .select('id, name, youtube_topic_channel_id, is_tracked')
      .not('youtube_topic_channel_id', 'is', null)
    if (trackedOnly) candidateQuery = candidateQuery.eq('is_tracked', true)
    candidateQuery = candidateQuery
      .order('is_tracked', { ascending: false })
      .order('name', { ascending: true })

    const { data: allCandidates, error: topicErr } = await candidateQuery
    if (topicErr) return NextResponse.json({ error: topicErr.message }, { status: 500 })

    const candidates = (allCandidates ?? [])
      .filter((r) => !ingestedIds.has(r.id as string))
      .slice(0, limit)

    for (const row of candidates) {
      const artistId = row.id as string
      const name = row.name as string
      const topicId = row.youtube_topic_channel_id as string
      const playlistId = uploadsPlaylistId(topicId)
      if (!playlistId) continue
      artistsScanned++

      let perInserted = 0
      let perDuplicates = 0

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
            perDuplicates++
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
              perDuplicates++
            } else {
              errors.push({ artist: name, error: insErr.message })
            }
          } else {
            inserted++
            perInserted++
          }
        }
      } catch (e) {
        errors.push({ artist: name, error: `uploads: ${e instanceof Error ? e.message : 'unknown'}` })
      }

      artistsProcessed.push({ name, inserted: perInserted, duplicates: perDuplicates })
    }

    // --- Artwork upgrade pass ---
    // Idempotent: find existing youtube-topic submissions that still carry the low-quality
    // 'mqdefault' thumbnail key and replace it with 'hqdefault' (no API call — hqdefault
    // always exists for any YouTube video).
    let artworkUpgraded = 0
    const { data: staleArtwork, error: artErr } = await supabase
      .from('submissions')
      .select('id, artwork_url')
      .eq('source_method', 'youtube-topic')
      .ilike('artwork_url', '%mqdefault%')
    if (artErr) {
      errors.push({ artist: '(artwork upgrade)', error: artErr.message })
    } else {
      for (const sub of staleArtwork ?? []) {
        const newUrl = (sub.artwork_url as string).replace('mqdefault', 'hqdefault')
        const { error: upErr } = await supabase
          .from('submissions')
          .update({ artwork_url: newUrl })
          .eq('id', sub.id as string)
          .ilike('artwork_url', '%mqdefault%') // guard: skip if already upgraded concurrently
        if (!upErr) artworkUpgraded++
        else errors.push({ artist: '(artwork upgrade)', error: upErr.message })
      }
    }

    return NextResponse.json({ artistsScanned, imagesBackfilled, inserted, duplicates, artworkUpgraded, artistsProcessed, errors })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
