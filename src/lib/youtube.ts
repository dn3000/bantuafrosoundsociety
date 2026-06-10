const BASE = 'https://www.googleapis.com/youtube/v3'

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null
}

type ChannelResult = {
  channelId: string
  title: string
  uploadsPlaylistId: string
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
  const key = apiKey()
  if (!key) return null
  try {
    const res = await fetch(`${url}&key=${key}`)
    if (!res.ok) return null
    const json = await res.json()
    const items = (json as { items?: unknown[] }).items
    if (!Array.isArray(items) || items.length === 0) return null
    return json
  } catch {
    return null
  }
}

function extractChannel(json: unknown): ChannelResult | null {
  try {
    const items = (json as { items: Record<string, unknown>[] }).items
    const item = items[0] as {
      id: string
      snippet: { title: string }
      contentDetails: { relatedPlaylists: { uploads: string } }
    }
    return {
      channelId: item.id,
      title: item.snippet.title,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    }
  } catch {
    return null
  }
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
    const items = (json as { items: Record<string, unknown>[] }).items
    return items.map((item) => {
      const cd = item.contentDetails as { videoId: string; videoPublishedAt: string }
      const sn = item.snippet as {
        title: string
        thumbnails?: { medium?: { url?: string } }
      }
      return {
        videoId: cd.videoId,
        title: sn.title,
        publishedAt: cd.videoPublishedAt,
        thumbnail: sn.thumbnails?.medium?.url ?? null,
      }
    })
  } catch {
    return []
  }
}

// Rationed operation: YouTube search costs 100 quota units per call.
export async function searchChannel(query: string): Promise<SearchResult[]> {
  const json = await fetchYT(
    `${BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=3`,
  )
  if (!json) return []
  try {
    const items = (json as { items: Record<string, unknown>[] }).items
    return items.map((item) => {
      const sn = item.snippet as { channelId: string; title: string; description: string }
      return {
        channelId: sn.channelId,
        title: sn.title,
        description: sn.description,
      }
    })
  } catch {
    return []
  }
}
