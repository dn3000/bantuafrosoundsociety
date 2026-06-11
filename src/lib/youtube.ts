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
// keyword list has a match wins; comparison is case-insensitive.
export function categorizeVideo(
  title: string,
): 'mix' | 'live_set' | 'music_video' | 'interview' | 'other' {
  const t = title.toLowerCase()
  const has = (term: string) => t.includes(term)

  if (
    has('interview') || has('in conversation') || has('q&a') ||
    has('documentary') || has('behind the scenes') || has('bts')
  ) return 'interview'

  if (
    has('live') || has('boiler room') || has('festival') || has('live at') ||
    has('performance') || has('concert') || has('@')
  ) return 'live_set'

  if (
    has('official video') || has('official music video') || has('music video') ||
    has('visualizer') || has('lyric video') || has('official audio')
  ) return 'music_video'

  if (
    has('mix') || has('mixed by') || has('set') || has('session') ||
    has('episode') || has('podcast') || has('vol') || has('guest mix')
  ) return 'mix'

  return 'other'
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
