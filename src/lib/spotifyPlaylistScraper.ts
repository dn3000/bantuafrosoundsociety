// Spotify playlist scraper.
//
// A second, additive scraper alongside the per-artist one (spotifyNewReleases.ts,
// which this file does NOT modify). It hits a completely different endpoint —
// GET /v1/playlists/{id}/tracks (up to 100 tracks/call) — so one curated playlist
// costs a handful of calls instead of the ~50 per-artist album scans needed to
// cover the same content.
//
// Reuse: getAccessToken (Client Credentials) and the pure helpers from the
// per-artist scraper (parseReleaseDate, mapAlbumTypeToSubmissionType,
// albumEmbedUrl). Dedup rides the existing submissions.source_url UNIQUE
// constraint, and the 429 back-off matches the per-artist scraper's contract.
//
// Trust model: the playlist itself is the gate — an admin curated it onto the
// tracked list — so scraped drops auto-publish as status='approved' (immediately
// public via the approved-read RLS), exactly like tracked-artist drops.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/spotify'
import {
  parseReleaseDate,
  mapAlbumTypeToSubmissionType,
  albumEmbedUrl,
} from '@/lib/spotifyNewReleases'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Same slug recipe as the bulk Spotify import + manual artist create: slugify the
// name, then append a short random suffix to keep the UNIQUE(slug) constraint happy.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
}

// ---- Spotify GET /v1/playlists/{id}/tracks shapes (only the fields we read) ----
type SimplifiedArtist = { id: string; name: string }

type PlaylistAlbum = {
  id: string
  name: string
  album_type: string // 'album' | 'single' | 'compilation'
  release_date: string
  release_date_precision: string
  images?: { url: string; width: number | null; height: number | null }[]
  external_urls?: { spotify?: string }
  artists?: SimplifiedArtist[] // album's credited artists; [0] is the lead
}

type PlaylistTrack = {
  id?: string
  is_local?: boolean
  type?: string // 'track' | 'episode'
  album?: PlaylistAlbum | null
  artists?: SimplifiedArtist[] // the track's credited artists
} | null

// PlaylistTrackObject wrapper: is_local lives here AND on the inner track.
type PlaylistItem = { is_local?: boolean; track: PlaylistTrack }
type TracksPage = { items?: PlaylistItem[]; next?: string | null }

export type ScrapePlaylistResult = {
  processed: number // playlist track items examined
  published: number // new submissions inserted
  duplicates: number // album already seen (this scan) or already in submissions
  oldSkipped: number // album.release_date < sinceDate
  errors: { error: string; context?: string }[]
  pagesFetched: number
  // Set when a 429 stopped pagination. retryAfter is Spotify's Retry-After (s),
  // or null if it sent none — same contract as fetchArtistReleasesSince.
  rateLimited: boolean
  retryAfter: number | null
}

export type ScrapePlaylistOpts = {
  sinceDate: string
  delayMs: number
  approvedAt: string // one approval timestamp per scan, shared by every row
  playlistName?: string | null
  addedBy?: string | null // stamped onto any auto-created artist stubs
}

// Resolve the primary artist row for an album's lead artist, auto-creating a
// watch-tier stub if we don't have them yet. This is how playlist scraping grows
// the roster organically: whoever curators put on a tracked playlist enters the
// artists table with the same data shape as the bulk Spotify import's stubs
// (tier='watch', is_tracked=false, source_method='bulk_import'), just discovered
// through curation instead of imported in bulk.
//
// `cache` memoises spotify_artist_id -> artists.id for the whole scan so repeat
// artists across tracks cost one lookup, not one per track.
async function resolvePrimaryArtistId(
  supabase: SupabaseClient,
  cache: Map<string, string | null>,
  artist: SimplifiedArtist,
  addedBy: string | null
): Promise<string | null> {
  const sid = artist.id
  if (cache.has(sid)) return cache.get(sid) ?? null

  // Already in our roster? Link to the existing row.
  const { data: existing, error: selErr } = await supabase
    .from('artists')
    .select('id')
    .eq('spotify_artist_id', sid)
    .limit(1)
    .maybeSingle()
  if (selErr) throw new Error(`artist lookup: ${selErr.message}`)
  if (existing?.id) {
    cache.set(sid, existing.id as string)
    return existing.id as string
  }

  // Otherwise auto-create a watch-tier stub matching the bulk-import shape.
  const base = slugify(artist.name) || 'artist'
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  const stub = {
    name: artist.name,
    slug,
    spotify_artist_id: sid,
    image_url: null,
    spotify_genres: [],
    country: 'South Africa',
    tier: 'watch',
    status: 'active',
    is_tracked: false,
    source_method: 'bulk_import',
  }
  const { data: created, error: insErr } = await supabase
    .from('artists')
    .insert(stub)
    .select('id')
    .single()
  if (insErr || !created) {
    // A concurrent scan may have inserted the same artist (UNIQUE on
    // spotify_artist_id) between our SELECT and INSERT — re-read and use theirs.
    const { data: again } = await supabase
      .from('artists')
      .select('id')
      .eq('spotify_artist_id', sid)
      .limit(1)
      .maybeSingle()
    if (again?.id) {
      cache.set(sid, again.id as string)
      return again.id as string
    }
    throw new Error(`artist create: ${insErr?.message ?? 'no row returned'}`)
  }
  // added_by moved to artists_private. Best-effort: the artist row (needed for
  // submission FKs) already exists, and a missing private row self-heals on the
  // next admin edit (PATCH upserts it), so we don't fail the whole scan over it.
  const { error: privErr } = await supabase
    .from('artists_private')
    .insert({ artist_id: created.id, added_by: addedBy })
  if (privErr) {
    console.error(`artists_private create for ${created.id}: ${privErr.message}`)
  }
  cache.set(sid, created.id as string)
  return created.id as string
}

// Scrape one playlist: page through its tracks (100/call, following the `next`
// URL), treat each track's underlying ALBUM as the submission unit, and insert
// each unique album as an auto-published submission. The album — not the track —
// is the unit, so N tracks from the same album yield ONE submission + N-1
// duplicates, keeping New Releases clean.
export async function scrapePlaylist(
  supabase: SupabaseClient,
  playlistId: string,
  opts: ScrapePlaylistOpts
): Promise<ScrapePlaylistResult> {
  const result: ScrapePlaylistResult = {
    processed: 0,
    published: 0,
    duplicates: 0,
    oldSkipped: 0,
    errors: [],
    pagesFetched: 0,
    rateLimited: false,
    retryAfter: null,
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    result.errors.push({ error: `Spotify auth failed: ${err instanceof Error ? err.message : 'unknown'}` })
    return result
  }

  const { sinceDate, delayMs, approvedAt } = opts
  const playlistName = opts.playlistName ?? null
  const addedBy = opts.addedBy ?? null

  // Per-scan state: album-level dedup (the album is the submission unit) and the
  // artist-resolution memo.
  const seenAlbumIds = new Set<string>()
  const artistCache = new Map<string, string | null>()

  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`

  while (url) {
    // Same pacing as the per-artist scraper: delayMs between every page fetch.
    if (result.pagesFetched > 0) await sleep(delayMs)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      if (res.status === 429) {
        // Honour Spotify's Retry-After (seconds). pagesFetched lets the caller
        // tell a mid-pagination throttle (progress) from an immediate one.
        const ra = res.headers.get('retry-after')
        result.rateLimited = true
        result.retryAfter = ra ? parseInt(ra, 10) : null
        break
      }
      const body = await res.text().catch(() => '')
      result.errors.push({ error: `Spotify ${res.status}: ${body.slice(0, 140)}` })
      break
    }

    const data = (await res.json()) as TracksPage
    result.pagesFetched++
    const items = data.items ?? []

    for (const item of items) {
      result.processed++
      const track = item.track
      // Skip local files and unavailable/removed entries (track === null).
      if (item.is_local || !track || track.is_local) continue
      const album = track.album
      if (!album || !album.id) continue // e.g. podcast episodes carry no album

      const releaseDate = parseReleaseDate(album.release_date, album.release_date_precision)
      if (!releaseDate) continue
      if (releaseDate < sinceDate) {
        result.oldSkipped++
        continue
      }
      const sourceUrl = album.external_urls?.spotify
      if (!sourceUrl) continue // source_url is NOT NULL and our dedup key

      // Album-level dedup within this scan: a second track from an album we've
      // already handled is a duplicate, not a second submission.
      if (seenAlbumIds.has(album.id)) {
        result.duplicates++
        continue
      }
      seenAlbumIds.add(album.id)

      // Primary artist = album.artists[0] — link to an existing row or stub one.
      let primaryArtistId: string | null = null
      const lead = album.artists?.[0]
      if (lead?.id) {
        try {
          primaryArtistId = await resolvePrimaryArtistId(supabase, artistCache, lead, addedBy)
        } catch (err) {
          result.errors.push({
            error: err instanceof Error ? err.message : 'artist resolve failed',
            context: album.name,
          })
        }
      }

      const row = {
        type: mapAlbumTypeToSubmissionType(album.album_type),
        source: 'spotify',
        source_url: sourceUrl,
        platform_id: album.id,
        title: album.name,
        primary_artist_id: primaryArtistId,
        artwork_url: album.images?.[0]?.url ?? null,
        release_date: releaseDate,
        embed_url: albumEmbedUrl(album.id),
        // Auto-publish: the curated playlist is the trust gate.
        status: 'approved',
        approved_at: approvedAt,
        approved_by: null,
        source_method: 'spotify-playlist',
        metadata: {
          source_playlist_id: playlistId,
          source_playlist_name: playlistName,
          spotify_artists: (track.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
        },
      }

      // Dedup on the existing source_url UNIQUE constraint via ON CONFLICT DO
      // NOTHING: an inserted row comes back (published); a conflict returns
      // nothing (a duplicate that already exists from a prior run or the artist
      // scraper). A duplicate never errors the run.
      const { data: inserted, error: insErr } = await supabase
        .from('submissions')
        .upsert(row, { onConflict: 'source_url', ignoreDuplicates: true })
        .select('id')
      if (insErr) {
        result.errors.push({ error: `insert: ${insErr.message}`, context: album.name })
        continue
      }
      if (inserted && inserted.length > 0) result.published++
      else result.duplicates++
    }

    url = data.next ?? null
  }

  return result
}
