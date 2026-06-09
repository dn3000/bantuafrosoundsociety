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
