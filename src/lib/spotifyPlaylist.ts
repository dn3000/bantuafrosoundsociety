import { extractSpotifyPlaylistId, fetchSpotifyPlaylistMeta } from '@/lib/spotify'

export function parsePlaylistId(input: string): string | null {
  return extractSpotifyPlaylistId(input)
}

export type PlaylistMetadata = {
  title: string
  curatorName: string | null
  coverImageUrl: string | null
  description: string | null
  trackCount: number
}

export async function getPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata | null> {
  try {
    const meta = await fetchSpotifyPlaylistMeta(playlistId)
    return {
      title: meta.name,
      curatorName: meta.ownerName,
      coverImageUrl: meta.imageUrl,
      description: meta.description,
      trackCount: meta.trackCount,
    }
  } catch {
    return null
  }
}

// Server-side only — Spotify oEmbed lacks CORS for browser calls.
// Fetches from https://open.spotify.com/oembed using the canonical playlist URL
// so query/tracking params never interfere. Never throws — returns null on failure.
export async function getPlaylistOEmbed(
  playlistId: string
): Promise<{ title: string; coverImageUrl: string } | null> {
  try {
    const canonicalUrl = `https://open.spotify.com/playlist/${playlistId}`
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`
    const res = await fetch(oembedUrl)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; thumbnail_url?: string }
    if (!data.title && !data.thumbnail_url) return null
    return {
      title: data.title ?? '',
      coverImageUrl: data.thumbnail_url ?? '',
    }
  } catch {
    return null
  }
}
