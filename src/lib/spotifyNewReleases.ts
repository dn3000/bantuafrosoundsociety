// Self-contained helpers for the Spotify new-releases scraper + release-date backfill.
//
// IMPORTANT: this module deliberately has ZERO imports so it can be loaded both by
// the Next route (via the `@/` alias) and by standalone Node verification scripts
// (via a relative `.ts` import under Node's type-stripping). Do not add `@/` or
// extensionless relative imports here.

export const SPOTIFY_MARKET = 'ZA'
export const DEFAULT_SINCE_DATE = '2026-01-01'
// Pacing between Spotify calls — applied between every album-list page fetch AND
// between artists, so the burst rate stays low. This app is on reduced Spotify
// quota, so default gently at 800ms (~1.25 req/sec); callers may raise it
// further when Spotify pushes back (the route accepts up to 5000ms).
export const SCRAPE_DELAY_MS = 800
// This Spotify app rejects limit > 10 on the artist-albums endpoint with
// "Invalid limit" (reduced-quota apps cap the page size at 10). Hard ceiling.
export const SPOTIFY_MAX_PAGE = 10
// The artist-albums endpoint orders results by include_group, then reverse-
// chronologically WITHIN each group. Combined groups are concatenated, so we
// sweep each group separately to allow a correct date-boundary early stop.
export const RELEASE_GROUPS = ['album', 'single'] as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type SpotifyImage = { url: string; width: number | null; height: number | null }

// SimplifiedAlbumObject from GET /v1/artists/{id}/albums
export type SpotifyArtistRef = { id: string; name: string }

export type SpotifyAlbumItem = {
  id: string
  name: string
  album_type: string // 'album' | 'single' | 'compilation'
  album_group?: string
  release_date: string
  release_date_precision: string // 'year' | 'month' | 'day'
  images: SpotifyImage[]
  external_urls: { spotify?: string }
  total_tracks?: number
  artists?: SpotifyArtistRef[] // credited (main) artists — used to flag collaborators
}

// The shape the scraper inserts into `submissions`.
//
// Auto-publish: the scraper only ever scans is_tracked = true (whitelisted)
// artists, so every scraped drop comes from a curated artist and is written
// directly as status = 'approved' — no per-release review. An approved row is
// immediately public (the public-read RLS exposes WHERE status = 'approved').
// approved_by is null: provenance is carried by source_method = 'scraper', not a
// human approver. This is scraper-only; the manual submission form still writes
// status = 'pending'.
export type SubmissionScrapeRow = {
  type: 'release' | 'single'
  source: 'spotify'
  source_url: string
  platform_id: string
  title: string
  primary_artist_id: string
  artwork_url: string | null
  release_date: string
  embed_url: string
  status: 'approved'
  approved_at: string
  approved_by: null
  source_method: 'scraper'
  // Captures the release's credited Spotify artists so reviewers can surface
  // collaborators not yet in our roster. We never auto-create artists.
  metadata: { spotify_artists: SpotifyArtistRef[] }
}

// album/compilation -> 'release', single -> 'single'
export function mapAlbumTypeToSubmissionType(albumType: string): 'release' | 'single' {
  return albumType === 'single' ? 'single' : 'release'
}

// Parse Spotify's release_date honouring release_date_precision.
//   day   -> full date as-is (YYYY-MM-DD)
//   month -> first of that month (YYYY-MM-01)
//   year  -> Jan 1 of that year (YYYY-01-01)
// Returns a 'YYYY-MM-DD' string, or null if unparseable.
export function parseReleaseDate(releaseDate: string | null | undefined, precision: string | null | undefined): string | null {
  if (!releaseDate) return null
  if (precision === 'day') {
    const m = releaseDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null
  }
  if (precision === 'month') {
    const m = releaseDate.match(/^(\d{4})-(\d{2})/)
    return m ? `${m[1]}-${m[2]}-01` : null
  }
  // year precision (or anything else that still starts with a 4-digit year)
  const y = releaseDate.match(/^(\d{4})/)
  return y ? `${y[1]}-01-01` : null
}

// Largest cover image by width (null widths treated as 0).
export function pickLargestImageUrl(images: SpotifyImage[] | null | undefined): string | null {
  if (!images || images.length === 0) return null
  const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0))
  return sorted[0]?.url ?? null
}

// Spotify embed URL. The artist-albums endpoint always yields album-typed refs
// (singles are albums with album_type='single'), so scraper embeds use /album/.
export function albumEmbedUrl(albumId: string): string {
  return `https://open.spotify.com/embed/album/${albumId}`
}

export function embedUrlFor(type: 'album' | 'track' | 'playlist', id: string): string {
  return `https://open.spotify.com/embed/${type}/${id}`
}

// Compare two 'YYYY-MM-DD' strings lexicographically (valid for ISO dates).
export function isBeforeDate(date: string, sinceDate: string): boolean {
  return date < sinceDate
}

// Map a Spotify album item -> an auto-published (status='approved') submission
// row, or a skip reason. `approvedAt` is the scan's approval timestamp (ISO
// string); the caller passes one value per scan pass so a batch shares it.
export function albumToSubmissionRow(
  album: SpotifyAlbumItem,
  primaryArtistId: string,
  sinceDate: string,
  approvedAt: string
): { row: SubmissionScrapeRow } | { skip: 'old' | 'invalid' } {
  const releaseDate = parseReleaseDate(album.release_date, album.release_date_precision)
  if (!releaseDate) return { skip: 'invalid' }
  const sourceUrl = album.external_urls?.spotify
  if (!sourceUrl || !album.id) return { skip: 'invalid' }
  // sinceDate filter happens AFTER we know the parsed date.
  if (isBeforeDate(releaseDate, sinceDate)) return { skip: 'old' }
  return {
    row: {
      type: mapAlbumTypeToSubmissionType(album.album_type),
      source: 'spotify',
      source_url: sourceUrl,
      platform_id: album.id,
      title: album.name,
      primary_artist_id: primaryArtistId,
      artwork_url: pickLargestImageUrl(album.images),
      release_date: releaseDate,
      embed_url: albumEmbedUrl(album.id),
      // Auto-publish: tracked-artist drops go straight to approved/public.
      status: 'approved',
      approved_at: approvedAt,
      approved_by: null,
      source_method: 'scraper',
      metadata: {
        spotify_artists: (album.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
      },
    },
  }
}

// ---- Spotify fetch helpers (dependency-free; use global fetch) ----

export type FetchReleasesResult =
  | { ok: true; items: SpotifyAlbumItem[]; pagesFetched: number; cappedGroups: string[] }
  // pagesFetched = pages successfully fetched before the error, so a caller can
  // tell "made progress then got throttled" from "throttled on the first call".
  | { ok: false; status: number; rateLimited: boolean; retryAfter: number | null; error: string; pagesFetched: number }

// Fetch an artist's album + single releases on/after `sinceDate`, market-scoped.
//
// Sweeps each include_group ('album','single') separately at the API's hard
// page cap (10), paginating by offset newest-first and stopping a group as soon
// as a page contains a release older than sinceDate (boundary reached). This is
// correct because within a single group Spotify returns reverse-chronological
// order. Items older than sinceDate may appear on the final boundary page —
// callers still date-filter each item. Paces itself between calls.
export async function fetchArtistReleasesSince(
  spotifyArtistId: string,
  token: string,
  opts: { sinceDate: string; market?: string; pageSize?: number; maxPagesPerGroup?: number; delayMs?: number }
): Promise<FetchReleasesResult> {
  const market = opts.market ?? SPOTIFY_MARKET
  const pageSize = Math.min(opts.pageSize ?? SPOTIFY_MAX_PAGE, SPOTIFY_MAX_PAGE)
  const maxPages = opts.maxPagesPerGroup ?? 10
  const delayMs = opts.delayMs ?? SCRAPE_DELAY_MS
  const sinceDate = opts.sinceDate

  const items: SpotifyAlbumItem[] = []
  let pagesFetched = 0
  const cappedGroups: string[] = []

  for (const group of RELEASE_GROUPS) {
    let offset = 0
    let page = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (pagesFetched > 0) await sleep(delayMs)
      const url = `https://api.spotify.com/v1/artists/${spotifyArtistId}/albums?include_groups=${group}&market=${market}&limit=${pageSize}&offset=${offset}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        if (res.status === 429) {
          // Honour Spotify's Retry-After (seconds). pagesFetched lets the caller
          // distinguish a mid-pagination throttle (progress) from an immediate one.
          const ra = res.headers.get('retry-after')
          return { ok: false, status: 429, rateLimited: true, retryAfter: ra ? parseInt(ra, 10) : null, error: 'Rate limited (429)', pagesFetched }
        }
        const body = await res.text().catch(() => '')
        return { ok: false, status: res.status, rateLimited: false, retryAfter: null, error: `Spotify ${res.status}: ${body.slice(0, 140)}`, pagesFetched }
      }
      const data = (await res.json()) as { items?: SpotifyAlbumItem[]; next?: string | null }
      const pageItems = data.items ?? []
      pagesFetched++
      page++
      items.push(...pageItems)

      const reachedOld = pageItems.some((it) => {
        const d = parseReleaseDate(it.release_date, it.release_date_precision)
        return d !== null && d < sinceDate
      })
      if (reachedOld) break
      if (!data.next || pageItems.length < pageSize) break
      offset += pageSize
      if (page >= maxPages) {
        cappedGroups.push(group)
        break
      }
    }
  }

  return { ok: true, items, pagesFetched, cappedGroups }
}

// Parse a Spotify album/track/playlist ref out of a URL or URI (for backfill).
export function parseSpotifyRef(input: string | null | undefined): { type: 'album' | 'track' | 'playlist'; id: string } | null {
  if (!input) return null
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/spotify\.com\/(?:intl-[a-z]+\/)?(album|track|playlist)\/([0-9A-Za-z]{22})/i)
  if (urlMatch) return { type: urlMatch[1].toLowerCase() as 'album' | 'track' | 'playlist', id: urlMatch[2] }
  const uriMatch = trimmed.match(/^spotify:(album|track|playlist):([0-9A-Za-z]{22})$/i)
  if (uriMatch) return { type: uriMatch[1].toLowerCase() as 'album' | 'track' | 'playlist', id: uriMatch[2] }
  return null
}

// Resolve the best Spotify ref for an existing submission row (backfill).
// Prefer the source_url (authoritative for the existing manual rows); fall back
// to platform_id (treated as an album id, since that's what the scraper stores).
export function resolveSubmissionRef(row: {
  source_url?: string | null
  platform_id?: string | null
}): { type: 'album' | 'track' | 'playlist'; id: string } | null {
  const fromUrl = parseSpotifyRef(row.source_url)
  if (fromUrl) return fromUrl
  if (row.platform_id && /^[0-9A-Za-z]{22}$/.test(row.platform_id)) {
    return { type: 'album', id: row.platform_id }
  }
  return null
}

export type BackfillMetaResult =
  | { ok: true; releaseDate: string | null; embedUrl: string }
  | { ok: false; status: number; rateLimited: boolean; retryAfter: number | null; error: string }

// Fetch release_date + embed_url for a single album/track/playlist ref (backfill).
export async function fetchBackfillMeta(
  ref: { type: 'album' | 'track' | 'playlist'; id: string },
  token: string
): Promise<BackfillMetaResult> {
  const endpoint =
    ref.type === 'album'
      ? `https://api.spotify.com/v1/albums/${ref.id}`
      : ref.type === 'track'
        ? `https://api.spotify.com/v1/tracks/${ref.id}`
        : `https://api.spotify.com/v1/playlists/${ref.id}?fields=id`
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
  if (res.ok) {
    const data = (await res.json()) as {
      release_date?: string
      release_date_precision?: string
      album?: { release_date?: string; release_date_precision?: string }
    }
    // album -> top-level release_date; track -> album.release_date; playlist -> none
    const rd = ref.type === 'track' ? data.album?.release_date : data.release_date
    const prec = ref.type === 'track' ? data.album?.release_date_precision : data.release_date_precision
    return { ok: true, releaseDate: parseReleaseDate(rd, prec), embedUrl: embedUrlFor(ref.type, ref.id) }
  }
  if (res.status === 429) {
    const ra = res.headers.get('retry-after')
    return { ok: false, status: 429, rateLimited: true, retryAfter: ra ? parseInt(ra, 10) : null, error: 'Rate limited (429)' }
  }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, rateLimited: false, retryAfter: null, error: `Spotify ${res.status}: ${body.slice(0, 140)}` }
}
