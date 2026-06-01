// In-memory access token cache (per server instance).
// Spotify Client Credentials tokens last 1 hour.
let tokenCache: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
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

export function extractSpotifyPlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[0-9A-Za-z]{22}$/.test(trimmed)) return trimmed
  const urlMatch = trimmed.match(/spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([0-9A-Za-z]{22})/i)
  if (urlMatch) return urlMatch[1]
  const uriMatch = trimmed.match(/^spotify:playlist:([0-9A-Za-z]{22})$/i)
  if (uriMatch) return uriMatch[1]
  return null
}

export type SpotifyPlaylistMeta = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  ownerName: string | null
  trackCount: number
}

export type SpotifyTrackArtist = {
  id: string
  name: string
}

export async function fetchSpotifyPlaylistMeta(playlistId: string): Promise<SpotifyPlaylistMeta> {
  const token = await getAccessToken()
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),tracks(total)`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify playlist meta fetch failed: ${res.status} ${body.slice(0, 200)}`)
  }
  const data = await res.json() as {
    id: string
    name: string
    description: string | null
    images: { url: string }[]
    owner: { display_name: string | null }
    tracks: { total: number }
  }
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    imageUrl: data.images?.[0]?.url || null,
    ownerName: data.owner?.display_name || null,
    trackCount: data.tracks?.total ?? 0,
  }
}

export async function fetchSpotifyPlaylistArtists(
  playlistId: string,
  maxTracks = 500
): Promise<SpotifyTrackArtist[]> {
  const token = await getAccessToken()
  const seen = new Map<string, SpotifyTrackArtist>()
  const pageSize = 100
  let offset = 0
  let totalFetched = 0

  while (totalFetched < maxTracks) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?fields=items(item(artists(id,name))),next&limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Spotify playlist tracks fetch failed: ${res.status} ${body.slice(0, 200)}`)
    }
    const data = await res.json() as {
      items: Array<{
        item?: { artists: { id: string; name: string }[] | null } | null
        track?: { artists: { id: string; name: string }[] | null } | null
      }>
      next: string | null
    }
    for (const item of data.items) {
      // Handle both new response shape (items[].item) and old (items[].track)
      const wrapper = item.item || item.track
      const artists = wrapper?.artists || []
      for (const a of artists) {
        if (a?.id && a?.name && !seen.has(a.id)) {
          seen.set(a.id, { id: a.id, name: a.name })
        }
      }
    }
    totalFetched += data.items.length
    if (!data.next || data.items.length < pageSize) break
    offset += pageSize
  }

  return Array.from(seen.values())
}

// =========================================
// Authorization Code (User) OAuth flow
// =========================================
// Used for endpoints Client Credentials can't access (e.g. playlist tracks).
// Admin connects their Spotify account once; tokens persisted in DB.

export const SPOTIFY_USER_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-read-email',
].join(' ')

export function buildSpotifyAuthUrl(opts: {
  redirectUri: string
  state: string
}): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  if (!clientId) throw new Error('Missing SPOTIFY_CLIENT_ID')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_USER_SCOPES,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    show_dialog: 'false',
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeSpotifyCode(opts: {
  code: string
  redirectUri: string
}): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Missing Spotify credentials')

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify code exchange failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

export async function refreshSpotifyToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type: string
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Missing Spotify credentials')

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify token refresh failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

export async function fetchSpotifyMe(accessToken: string): Promise<{
  id: string
  display_name: string | null
  email: string | null
}> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify /me failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

// User-authenticated playlist track fetch (replaces Client Credentials version
// for the bulk import flow).
export async function fetchSpotifyPlaylistArtistsUserAuth(
  playlistId: string,
  accessToken: string,
  maxTracks = 500
): Promise<SpotifyTrackArtist[]> {
  const seen = new Map<string, SpotifyTrackArtist>()
  const pageSize = 100
  let offset = 0
  let totalFetched = 0

  while (totalFetched < maxTracks) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?fields=items(item(artists(id,name))),next&limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Spotify playlist tracks (user auth) failed: ${res.status} ${body.slice(0, 200)}`)
    }
    const data = await res.json() as {
      items: Array<{
        item?: { artists: { id: string; name: string }[] | null } | null
        track?: { artists: { id: string; name: string }[] | null } | null
      }>
      next: string | null
    }
    for (const item of data.items) {
      // Handle both new response shape (items[].item) and old (items[].track)
      const wrapper = item.item || item.track
      const artists = wrapper?.artists || []
      for (const a of artists) {
        if (a?.id && a?.name && !seen.has(a.id)) {
          seen.set(a.id, { id: a.id, name: a.name })
        }
      }
    }
    totalFetched += data.items.length
    if (!data.next || data.items.length < pageSize) break
    offset += pageSize
  }
  return Array.from(seen.values())
}

export async function fetchSpotifyArtistsBulk(
  artistIds: string[]
): Promise<Array<{ id: string; name: string; genres: string[]; imageUrl: string | null; followers: number; popularity: number }>> {
  const token = await getAccessToken()
  const results: Array<{ id: string; name: string; genres: string[]; imageUrl: string | null; followers: number; popularity: number }> = []

  const batchSize = 50
  for (let i = 0; i < artistIds.length; i += batchSize) {
    const batch = artistIds.slice(i, i + batchSize)
    const url = `https://api.spotify.com/v1/artists?ids=${batch.join(',')}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      throw new Error(`Spotify artists batch fetch failed: ${res.status}`)
    }
    const data = await res.json() as {
      artists: Array<{
        id: string
        name: string
        genres: string[]
        images: { url: string; width: number }[]
        followers: { total: number }
        popularity: number
      } | null>
    }
    for (const a of data.artists) {
      if (!a) continue
      const sorted = [...(a.images || [])].sort((x, y) => (y.width || 0) - (x.width || 0))
      results.push({
        id: a.id,
        name: a.name,
        genres: a.genres || [],
        imageUrl: sorted[0]?.url || null,
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
      })
    }
  }

  return results
}
