// Shazam top-tracks fetcher.
//
// The contract follows shazamio (github.com/shazamio/ShazamIO), the
// best-maintained third-party Shazam client:
//   1. GET /services/charts/locations  → list of { countries: [...] }, each
//      with a "genres" array; each genre carries an Apple-Music playlist
//      "listid" (e.g. pl.ce03a6f815194c579359ee204dbdd1e0 for ZA Dance at
//      time of writing).
//   2. GET /services/amapi/v1/catalog/{country}/playlists/{listid}/tracks
//      → Apple amp-api response: { data: [{ id, attributes: { name,
//      artistName, artwork.url, url, isrc } }, ...] }.
//
// Shazam puts a Varnish/Fastly anti-bot wall in front of these endpoints
// that frequently blocks unauthenticated server-side fetches (returns a
// canned 405 "Not allowed" HTML). The caller MUST treat fetchShazamTop
// as a moving target — it returns null on any failure rather than
// throwing, so the route layer can surface a clean { ok:false, message }
// to the admin and the manual-entry path remains the safety net.

// Apple-Music artwork URLs come with {w}x{h} placeholders that the client
// is expected to fill in. We resolve them to a square 600px cover.
function resolveArtwork(template: string | undefined | null): string | null {
  if (!template) return null
  return template.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg')
}

export type ShazamTrack = {
  position: number
  title: string
  artistName: string
  artworkUrl: string | null
  appleMusicUrl: string | null
  isrc: string | null
  externalId: string | null
}

const LOCATIONS_URL = 'https://www.shazam.com/services/charts/locations'
const TRACKS_URL_TPL =
  'https://www.shazam.com/services/amapi/v1/catalog/{country}/playlists/{listid}/tracks?limit={limit}&offset=0&l={language}&relate%5Bsongs%5D=artists%2Cmusic-videos'

// Browser-like headers — Shazam's Varnish layer rejects requests that
// look obviously like bots. Even with these, the edge frequently 405s
// from cloud IPs; the caller must handle null returns.
const REQUEST_HEADERS: Record<string, string> = {
  Origin: 'https://www.shazam.com',
  Referer: 'https://www.shazam.com/charts',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
}

const REQUEST_TIMEOUT_MS = 12_000

type LocationsResponse = {
  countries?: Array<{
    id?: string
    genres?: Array<{
      urlName?: string
      listid?: string
    }>
  }>
}

type AmpApiTrack = {
  id?: string
  attributes?: {
    name?: string
    artistName?: string
    url?: string
    isrc?: string
    artwork?: { url?: string }
  }
}

type AmpApiTracksResponse = {
  data?: AmpApiTrack[]
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: ctl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn(`[shazam] ${url} → HTTP ${res.status}`)
      return null
    }
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('json')) {
      console.warn(`[shazam] ${url} → non-JSON content-type "${ct}"`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[shazam] ${url} threw:`, err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function resolvePlaylistId(
  country: string,
  genreUrlName: string,
): Promise<string | null> {
  const locs = await fetchJson<LocationsResponse>(LOCATIONS_URL)
  if (!locs || !Array.isArray(locs.countries)) return null
  const match = locs.countries.find((c) => c.id === country)
  if (!match || !Array.isArray(match.genres)) return null
  const genre = match.genres.find((g) => g.urlName === genreUrlName)
  return genre?.listid ?? null
}

export type ShazamFetchResult =
  | { ok: true; tracks: ShazamTrack[]; playlistId: string }
  | { ok: false; message: string }

export async function fetchShazamTop(opts: {
  country: string
  genreUrlName: string
  language: string
  limit?: number
}): Promise<ShazamFetchResult> {
  const limit = opts.limit ?? 50
  const playlistId = await resolvePlaylistId(opts.country, opts.genreUrlName)
  if (!playlistId) {
    return {
      ok: false,
      message: `Could not resolve Shazam playlist id for ${opts.country}/${opts.genreUrlName} (locations endpoint blocked or genre missing)`,
    }
  }

  const url = TRACKS_URL_TPL
    .replace('{country}', encodeURIComponent(opts.country))
    .replace('{listid}', encodeURIComponent(playlistId))
    .replace('{limit}', String(limit))
    .replace('{language}', encodeURIComponent(opts.language))

  const body = await fetchJson<AmpApiTracksResponse>(url)
  if (!body) {
    return {
      ok: false,
      message: `Shazam tracks endpoint returned no JSON (Varnish anti-bot wall blocking this IP, or contract changed). Playlist id: ${playlistId}`,
    }
  }
  if (!Array.isArray(body.data) || body.data.length === 0) {
    return {
      ok: false,
      message: `Shazam tracks endpoint returned empty data array. Playlist id: ${playlistId}`,
    }
  }

  const tracks: ShazamTrack[] = []
  for (let i = 0; i < body.data.length; i++) {
    const t = body.data[i]
    const attr = t.attributes
    const name = attr?.name?.trim()
    const artist = attr?.artistName?.trim()
    if (!name || !artist) continue
    tracks.push({
      position: i + 1,
      title: name,
      artistName: artist,
      artworkUrl: resolveArtwork(attr?.artwork?.url),
      appleMusicUrl: attr?.url ?? null,
      isrc: attr?.isrc ?? null,
      externalId: t.id ?? null,
    })
  }

  if (tracks.length === 0) {
    return {
      ok: false,
      message: 'Shazam response had data but no usable tracks (all rows missing name/artistName)',
    }
  }

  return { ok: true, tracks, playlistId }
}

// Resolver for the SA Dance chart — keeps the chart_key → (country, genre)
// mapping in one place so the admin route just passes a chart_key.
export const CHART_SOURCES = {
  'shazam-za-dance': {
    label: 'Shazam · South Africa · Dance',
    country: 'ZA',
    genreUrlName: 'dance',
    language: 'en-ZA',
  },
} as const

export type ChartKey = keyof typeof CHART_SOURCES
