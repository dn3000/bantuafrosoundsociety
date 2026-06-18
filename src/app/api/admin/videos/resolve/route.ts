import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { parseVideoInput, getVideoById, categorizeVideo } from '@/lib/youtube'

// POST /api/admin/videos/resolve  { url }
//
// Resolves a pasted YouTube link to metadata for the paste-a-link form:
//   1. parse the video ID (watch / youtu.be / shorts / music URLs, bare ID),
//   2. detect duplicates up front (mirrors the OAC scraper) — if the video is
//      already in the table, return { exists:true } with an edit link,
//   3. fetch metadata via the Data API, falling back to YouTube oEmbed,
//   4. auto-categorise + best-effort roster match (Data API path only, where we
//      have the channel ID).
// The admin reviews/overrides everything before saving.

const FETCH_TIMEOUT_MS = 8000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (+BASS-Admin-Resolver)'

type OEmbedResult = { title: string; channelTitle: string; thumbnailUrl: string | null }

async function fetchOEmbed(watchUrl: string): Promise<OEmbedResult | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`
    const res = await fetch(endpoint, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      title?: unknown
      author_name?: unknown
      thumbnail_url?: unknown
    }
    const title = typeof data.title === 'string' ? data.title : ''
    if (!title) return null
    return {
      title,
      channelTitle: typeof data.author_name === 'string' ? data.author_name : '',
      thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const parsed = parseVideoInput(rawUrl)
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Could not find a YouTube video ID in that link. Paste a watch, youtu.be, or shorts URL.',
      },
      { status: 400 },
    )
  }
  const { videoId } = parsed

  // Duplicate detection (OAC scraper pattern): pre-check youtube_video_id.
  const { data: existing } = await supabase
    .from('videos')
    .select('id, title, status, category')
    .eq('youtube_video_id', videoId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      exists: true,
      video: existing,
      editUrl: `/admin/videos#video-${existing.id}`,
    })
  }

  // Metadata: Data API first, oEmbed fallback.
  let title = ''
  let channelTitle = ''
  let channelId = ''
  let publishedAt: string | null = null
  let thumbnailUrl: string | null = null
  let metadataSource: 'data_api' | 'oembed' = 'oembed'

  const meta = await getVideoById(videoId)
  if (meta) {
    title = meta.title
    channelTitle = meta.channelTitle
    channelId = meta.channelId
    publishedAt = meta.publishedAt
    thumbnailUrl = meta.thumbnailUrl
    metadataSource = 'data_api'
  } else {
    const oe = await fetchOEmbed(`https://www.youtube.com/watch?v=${videoId}`)
    if (oe) {
      title = oe.title
      channelTitle = oe.channelTitle
      thumbnailUrl = oe.thumbnailUrl
      metadataSource = 'oembed'
    }
  }

  if (!title) {
    return NextResponse.json(
      { error: 'Could not fetch video details from YouTube. It may be private or removed.' },
      { status: 502 },
    )
  }

  // Roster match — only possible with a channel ID (Data API path).
  let suggestedArtist: { id: string; slug: string; name: string } | null = null
  if (channelId) {
    const { data: match } = await supabase
      .from('artists')
      .select('id, slug, name')
      .or(`youtube_channel_id.eq.${channelId},youtube_topic_channel_id.eq.${channelId}`)
      .limit(1)
      .maybeSingle()
    if (match) suggestedArtist = match
  }

  return NextResponse.json({
    exists: false,
    videoId,
    title,
    thumbnailUrl,
    publishedAt,
    channelTitle,
    suggestedCategory: categorizeVideo(title),
    suggestedArtist,
    metadataSource,
  })
}
