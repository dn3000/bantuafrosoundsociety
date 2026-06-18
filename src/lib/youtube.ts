const BASE = 'https://www.googleapis.com/youtube/v3'

type ChannelResult = {
  channelId: string
  title: string
  uploadsPlaylistId: string
  thumbnail: string | null
}

type UploadItem = {
  videoId: string
  title: string
  publishedAt: string
  thumbnail: string | null
}

type SearchResult = {
  channelId: string
  title: string
  description: string
}

async function fetchYT(url: string): Promise<unknown | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${url}&key=${key}`)
    if (!res.ok) return null
    const json: unknown = await res.json()
    const items = (json as { items?: unknown[] })?.items
    if (!Array.isArray(items) || items.length === 0) return null
    return json
  } catch {
    return null
  }
}

function extractChannel(json: unknown): ChannelResult | null {
  try {
    const item = (json as { items?: Array<Record<string, unknown>> })?.items?.[0] as
      | {
          id?: string
          snippet?: {
            title?: string
            thumbnails?: {
              high?: { url?: string }
              medium?: { url?: string }
              default?: { url?: string }
            }
          }
          contentDetails?: { relatedPlaylists?: { uploads?: string } }
        }
      | undefined
    const channelId = item?.id ?? null
    const title = item?.snippet?.title ?? null
    const uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads ?? null
    const thumbnail =
      item?.snippet?.thumbnails?.high?.url ??
      item?.snippet?.thumbnails?.medium?.url ??
      item?.snippet?.thumbnails?.default?.url ??
      null
    if (!channelId || !title || !uploadsPlaylistId) return null
    return { channelId, title, uploadsPlaylistId, thumbnail }
  } catch {
    return null
  }
}

// Derive the uploads playlist ID for a YouTube channel via the UC→UU convention.
// YouTube Music auto-generated Topic channels follow this pattern predictably,
// saving an extra channels.list API call per artist.
export function uploadsPlaylistId(channelId: string): string | null {
  if (!channelId || !channelId.startsWith('UC')) return null
  return 'UU' + channelId.slice(2)
}

export async function resolveChannelByHandle(handle: string): Promise<ChannelResult | null> {
  const h = handle.startsWith('@') ? handle.slice(1) : handle
  const json = await fetchYT(
    `${BASE}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(h)}`,
  )
  if (!json) return null
  return extractChannel(json)
}

export async function getChannelById(channelId: string): Promise<ChannelResult | null> {
  const json = await fetchYT(
    `${BASE}/channels?part=snippet,contentDetails&id=${encodeURIComponent(channelId)}`,
  )
  if (!json) return null
  return extractChannel(json)
}

export async function getRecentUploads(
  uploadsPlaylistId: string,
  max = 15,
): Promise<UploadItem[]> {
  const json = await fetchYT(
    `${BASE}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${max}`,
  )
  if (!json) return []
  try {
    const items = (json as { items?: unknown[] })?.items ?? []
    return items.map((raw) => {
      const item = raw as {
        contentDetails?: { videoId?: string; videoPublishedAt?: string }
        snippet?: {
          title?: string
          thumbnails?: {
            maxres?: { url?: string }
            standard?: { url?: string }
            high?: { url?: string }
            medium?: { url?: string }
            default?: { url?: string }
          }
        }
      }
      const thumbnails = item?.snippet?.thumbnails
      return {
        videoId: item?.contentDetails?.videoId ?? '',
        title: item?.snippet?.title ?? '',
        publishedAt: item?.contentDetails?.videoPublishedAt ?? '',
        thumbnail:
          thumbnails?.maxres?.url ??
          thumbnails?.standard?.url ??
          thumbnails?.high?.url ??
          thumbnails?.medium?.url ??
          thumbnails?.default?.url ??
          null,
      }
    })
  } catch {
    return []
  }
}

type ChannelCandidate = {
  channelId: string
  title: string
  thumbnail: string | null
}

export type ResolveResult = {
  channelId: string
  title: string
  isTopic: boolean
  thumbnail: string | null
}

export type SuggestResult = {
  topic: ChannelCandidate | null
  oac: ChannelCandidate | null
}

// Rationed operation: YouTube search costs 100 quota units per call.
export async function searchChannel(query: string): Promise<SearchResult[]> {
  const json = await fetchYT(
    `${BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=3`,
  )
  if (!json) return []
  try {
    const items = (json as { items?: unknown[] })?.items ?? []
    return items.map((raw) => {
      const item = raw as {
        snippet?: { channelId?: string; title?: string; description?: string }
      }
      return {
        channelId: item?.snippet?.channelId ?? '',
        title: item?.snippet?.title ?? '',
        description: item?.snippet?.description ?? '',
      }
    })
  } catch {
    return []
  }
}

// Accept youtube.com/@handle, youtube.com/channel/UC…, music.youtube.com/channel/UC…,
// bare @handle, or bare UC… channel ID.
export function parseYouTubeInput(
  input: string,
): { kind: 'id' | 'handle'; value: string } | null {
  const s = input.trim()
  if (!s) return null

  // Try URL parse (add https if the string looks like a bare domain)
  const toTry = /^https?:\/\//i.test(s) ? s : s.includes('.') ? `https://${s}` : null
  if (toTry) {
    try {
      const url = new URL(toTry)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'youtube.com' || host === 'music.youtube.com') {
        const channelMatch = url.pathname.match(/^\/channel\/(UC[\w-]{20,})/)
        if (channelMatch) return { kind: 'id', value: channelMatch[1] }
        const handleMatch = url.pathname.match(/^\/@([\w.-]+)/)
        if (handleMatch) return { kind: 'handle', value: handleMatch[1] }
      }
    } catch {
      // fall through
    }
  }

  // Bare UC… channel ID
  if (/^UC[\w-]{20,}$/.test(s)) return { kind: 'id', value: s }

  // Bare @handle (@ prefix required to avoid ambiguity with plain words)
  if (s.startsWith('@') && /^@[\w.-]+$/.test(s)) return { kind: 'handle', value: s.slice(1) }

  return null
}

export async function resolveChannelByInput(input: string): Promise<ResolveResult | null> {
  const parsed = parseYouTubeInput(input)
  if (!parsed) return null
  const channel =
    parsed.kind === 'id'
      ? await getChannelById(parsed.value)
      : await resolveChannelByHandle(parsed.value)
  if (!channel) return null
  return {
    channelId: channel.channelId,
    title: channel.title,
    isTopic: channel.title.endsWith(' - Topic'),
    thumbnail: channel.thumbnail,
  }
}

// Title-based category heuristic for YouTube videos. First category whose
// pattern list has a match wins; comparison is case-insensitive.
//
// Sanity checks (all must pass):
//   "Song (Black Coffee Remix)"  → other   (\bmix\b won't fire; m in "remix" follows word-char 'e')
//   "Sunset Vibes"               → other
//   "Alive"                      → other   (\blive\b needs boundary before l; not present in "alive")
//   "For You Vol.21 Mixed By X"  → mix     (\bvol\b\.? + mixed by)
//   "Boiler Room: Artist"        → live_set
//   "Song (Lyric Video)"         → other   (lyric video intentionally excluded from music_video)
export function categorizeVideo(
  title: string,
): 'mix' | 'live_set' | 'music_video' | 'interview' | 'other' {
  const t = title.toLowerCase()
  const is = (re: RegExp) => re.test(t)

  if (
    is(/\binterview\b/) ||
    is(/in conversation/) ||
    is(/\bq&a\b/) ||
    is(/\bdocumentary\b/) ||
    is(/behind the scenes/) ||
    is(/\bbts\b/)
  ) return 'interview'

  // \s@ matches "DJ @ Venue" without firing on every bare @handle in a description
  if (
    is(/\blive\b/) ||
    is(/boiler room/) ||
    is(/\bfestival\b/) ||
    is(/live at/) ||
    is(/\bperformance\b/) ||
    is(/\bconcert\b/) ||
    is(/\s@/)
  ) return 'live_set'

  if (
    is(/official music video/) ||
    is(/official video/) ||
    is(/music video/) ||
    is(/\bvisualizer\b/)
  ) return 'music_video'

  // \bmix(?:ed|tape)?\b won't match "remix" — no word boundary before m in "re-mix"
  if (
    is(/\bmix(?:ed|tape)?\b/) ||
    is(/mixed by/) ||
    is(/\bset\b/) ||
    is(/\bsession\b/) ||
    is(/\bepisode\b/) ||
    is(/\bpodcast\b/) ||
    is(/\bvol\b\.?/) ||
    is(/guest mix/)
  ) return 'mix'

  return 'other'
}

// Batch-fetch channel titles by ID. Accepts up to 500 IDs, batches into
// groups of 50 (the API max), costs 1 quota unit per batch call.
// Returns only the channels found; missing IDs are silently omitted.
export async function getChannelsByIds(
  ids: string[],
): Promise<{ id: string; title: string }[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key || ids.length === 0) return []

  const results: { id: string; title: string }[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    try {
      const res = await fetch(
        `${BASE}/channels?part=snippet&id=${batch.join(',')}&key=${key}`,
      )
      if (!res.ok) continue
      const json: unknown = await res.json()
      const items = (json as { items?: unknown[] })?.items ?? []
      for (const raw of items) {
        const item = raw as { id?: string; snippet?: { title?: string } }
        if (item?.id && item?.snippet?.title) {
          results.push({ id: item.id, title: item.snippet.title })
        }
      }
    } catch {
      // skip batch on error
    }
  }
  return results
}

// Costs ~2 search quota units (100 units each).
// Defensive: never throws, returns nulls for any failed arm.
export async function suggestChannels(name: string): Promise<SuggestResult> {
  try {
    const [topicResults, oacResults] = await Promise.all([
      searchChannel(`${name} topic`).catch(() => [] as SearchResult[]),
      searchChannel(name).catch(() => [] as SearchResult[]),
    ])

    const topicCandidate = topicResults.find((r) => r.title.endsWith(' - Topic')) ?? null
    const oacCandidate = oacResults.find((r) => !r.title.endsWith(' - Topic')) ?? null

    const [topicHydrated, oacHydrated] = await Promise.all([
      topicCandidate ? getChannelById(topicCandidate.channelId) : Promise.resolve(null),
      oacCandidate ? getChannelById(oacCandidate.channelId) : Promise.resolve(null),
    ])

    return {
      topic: topicHydrated
        ? { channelId: topicHydrated.channelId, title: topicHydrated.title, thumbnail: topicHydrated.thumbnail }
        : null,
      oac: oacHydrated
        ? { channelId: oacHydrated.channelId, title: oacHydrated.title, thumbnail: oacHydrated.thumbnail }
        : null,
    }
  } catch {
    return { topic: null, oac: null }
  }
}

// ── Single-video metadata (paste-a-link) ───────────────────────────────────

const VIDEO_ID_RE = /^[\w-]{11}$/

// Parse a single video reference from common YouTube URL shapes or a bare ID.
// Accepts: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
// youtube.com/embed/ID, youtube.com/live/ID, music.youtube.com/watch?v=ID,
// m.youtube.com variants, and a bare 11-char video ID. Distinct from
// parseYouTubeInput, which only resolves channel/handle URLs.
export function parseVideoInput(input: string): { videoId: string } | null {
  const s = input.trim()
  if (!s) return null

  // Bare 11-char video ID (no path/host punctuation).
  if (!s.includes('/') && !s.includes('.') && VIDEO_ID_RE.test(s)) {
    return { videoId: s }
  }

  const toTry = /^https?:\/\//i.test(s) ? s : s.includes('.') ? `https://${s}` : null
  if (!toTry) return null

  try {
    const url = new URL(toTry)
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]
      if (VIDEO_ID_RE.test(id)) return { videoId: id }
      return null
    }

    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v')
      if (v && VIDEO_ID_RE.test(v)) return { videoId: v }
      const pathMatch = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
      if (pathMatch) return { videoId: pathMatch[1] }
    }
  } catch {
    // fall through
  }
  return null
}

export type VideoMeta = {
  id: string
  title: string
  channelTitle: string
  channelId: string
  publishedAt: string | null
  thumbnailUrl: string | null
}

// videos.list — metadata for a single video via the Data API. Returns null on
// missing key / no result / 4xx-5xx (fetchYT already swallows those), so the
// caller can fall back to oEmbed.
export async function getVideoById(videoId: string): Promise<VideoMeta | null> {
  const json = await fetchYT(
    `${BASE}/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`,
  )
  if (!json) return null
  try {
    const item = (json as { items?: Array<Record<string, unknown>> })?.items?.[0] as
      | {
          id?: string
          snippet?: {
            title?: string
            channelTitle?: string
            channelId?: string
            publishedAt?: string
            thumbnails?: {
              maxres?: { url?: string }
              standard?: { url?: string }
              high?: { url?: string }
              medium?: { url?: string }
              default?: { url?: string }
            }
          }
        }
      | undefined
    const title = item?.snippet?.title
    if (!title) return null
    const thumbs = item?.snippet?.thumbnails
    return {
      id: item?.id ?? videoId,
      title,
      channelTitle: item?.snippet?.channelTitle ?? '',
      channelId: item?.snippet?.channelId ?? '',
      publishedAt: item?.snippet?.publishedAt ?? null,
      thumbnailUrl:
        thumbs?.maxres?.url ??
        thumbs?.standard?.url ??
        thumbs?.high?.url ??
        thumbs?.medium?.url ??
        thumbs?.default?.url ??
        null,
    }
  } catch {
    return null
  }
}
