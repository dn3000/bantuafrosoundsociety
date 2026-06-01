// In-memory access token cache (per server instance).
// Spotify Client Credentials tokens last 1 hour.
let tokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify credentials in environment')
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify token request failed: ${res.status} ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

export type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
  imageUrl: string | null
  followers: number
  popularity: number
  externalUrl: string | null
}

export function extractSpotifyArtistId(input: string): string | null {
  const trimmed = input.trim()
  // Direct ID (22-char base62)
  if (/^[0-9A-Za-z]{22}$/.test(trimmed)) return trimmed
  // URL: https://open.spotify.com/artist/{id} (optional query string)
  const urlMatch = trimmed.match(/spotify\.com\/(?:intl-[a-z]+\/)?artist\/([0-9A-Za-z]{22})/i)
  if (urlMatch) return urlMatch[1]
  // URI: spotify:artist:{id}
  const uriMatch = trimmed.match(/^spotify:artist:([0-9A-Za-z]{22})$/i)
  if (uriMatch) return uriMatch[1]
  return null
}

export async function fetchSpotifyArtist(artistId: string): Promise<SpotifyArtist> {
  const token = await getAccessToken()
  const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify artist fetch failed: ${res.status} ${text}`)
  }
  const data = await res.json() as {
    id: string
    name: string
    genres: string[]
    images: { url: string; height: number; width: number }[]
    followers: { total: number }
    popularity: number
    external_urls: { spotify?: string }
  }
  // Pick largest image
  const sortedImages = [...(data.images || [])].sort(
    (a, b) => (b.width || 0) - (a.width || 0)
  )
  return {
    id: data.id,
    name: data.name,
    genres: data.genres || [],
    imageUrl: sortedImages[0]?.url || null,
    followers: data.followers?.total ?? 0,
    popularity: data.popularity ?? 0,
    externalUrl: data.external_urls?.spotify || null,
  }
}
