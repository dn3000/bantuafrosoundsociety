// Per-artist Spotify scrape helper — shared by:
//   • POST /api/admin/scrapers/spotify-new-releases  (bulk loop)
//   • POST /api/admin/artists/[id]/scan              (single-artist trigger)
//
// One artist in, one outcome out: paginate the artist's releases since
// `sinceDate`, transform to submission rows, dedup vs existing, insert with
// onConflict-do-nothing, stamp last_scanned_at on success. The caller handles
// pacing between artists (the bulk loop does; the single-artist route has
// nothing to pace).
//
// Stamping rule: last_scanned_at is set only when the Spotify pagination
// completes successfully (scrapeOk=true). 429s and network errors leave it
// untouched, so errored artists float to the top of the least-recently-scanned
// sort for natural retry on the next run. DB errors after a successful scrape
// (dedup/insert) do NOT block the stamp — the Spotify state was observed; the
// retry-on-failure path is repair, not rescrape.

import {
  SPOTIFY_MARKET,
  albumToSubmissionRow,
  fetchArtistReleasesSince,
  type SubmissionScrapeRow,
} from '@/lib/spotifyNewReleases'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ScrapeNote = { artist?: string; id?: string; error: string }

export type ProcessArtistOutcome = {
  // Per-artist counts. published = freshly inserted (not duplicates).
  releasesSeen: number
  published: number
  duplicates: number
  oldSkipped: number
  // Pages successfully fetched from Spotify before the call returned.
  pagesFetched: number
  // Groups whose pagination hit the per-group page cap (older releases unseen).
  cappedGroups: string[]
  // True when Spotify pagination completed successfully. Drives whether
  // last_scanned_at gets stamped, and whether the bulk loop counts the artist
  // toward chunkArtists telemetry.
  scrapeOk: boolean
  // True when ANY non-429 response was received (success or live error). Drives
  // the bulk client's consecutive-429 streak detector.
  madeProgress: boolean
  // Set when Spotify returned 429; the caller breaks the bulk chunk.
  rateLimited: boolean
  retryAfter: number | null
  // Per-artist errors collected through the call (fetch errors,
  // dedup/insert errors, stamp errors). Not fatal to the bulk loop.
  errors: ScrapeNote[]
}

export async function processArtistScrape(
  supabase: SupabaseServerClient,
  token: string,
  artist: { id: string; name: string; spotify_artist_id: string },
  sinceDate: string,
  approvedAt: string,
  delayMs: number,
): Promise<ProcessArtistOutcome> {
  const outcome: ProcessArtistOutcome = {
    releasesSeen: 0,
    published: 0,
    duplicates: 0,
    oldSkipped: 0,
    pagesFetched: 0,
    cappedGroups: [],
    scrapeOk: false,
    madeProgress: false,
    rateLimited: false,
    retryAfter: null,
    errors: [],
  }

  const result = await fetchArtistReleasesSince(artist.spotify_artist_id, token, {
    sinceDate,
    market: SPOTIFY_MARKET,
    pageSize: 10,
    delayMs,
  })
  outcome.pagesFetched = result.pagesFetched

  if (!result.ok) {
    if (result.rateLimited) {
      outcome.rateLimited = true
      outcome.retryAfter = result.retryAfter
      // A 429 after >=1 successful page = the token isn't fully throttled yet.
      if (result.pagesFetched > 0) outcome.madeProgress = true
      outcome.errors.push({
        artist: artist.name,
        error: `Rate limited (429)${result.retryAfter ? `, retry after ${result.retryAfter}s` : ''}`,
      })
      return outcome
    }
    // Non-429 error: live response → counts as progress.
    outcome.madeProgress = true
    outcome.errors.push({ artist: artist.name, error: result.error })
    return outcome
  }

  outcome.madeProgress = true
  outcome.scrapeOk = true
  outcome.cappedGroups = result.cappedGroups
  outcome.releasesSeen = result.items.length

  // Transform + sinceDate filter + intra-artist dedup by source_url.
  const seen = new Set<string>()
  const candidates: SubmissionScrapeRow[] = []
  for (const album of result.items) {
    const mapped = albumToSubmissionRow(album, artist.id, sinceDate, approvedAt)
    if ('skip' in mapped) {
      if (mapped.skip === 'old') outcome.oldSkipped++
      continue
    }
    if (seen.has(mapped.row.source_url)) continue
    seen.add(mapped.row.source_url)
    candidates.push(mapped.row)
  }

  if (candidates.length > 0) {
    const urls = candidates.map((c) => c.source_url)
    const { data: existing, error: existErr } = await supabase
      .from('submissions')
      .select('source_url')
      .in('source_url', urls)
    if (existErr) {
      outcome.errors.push({ artist: artist.name, error: `dedup check: ${existErr.message}` })
    } else {
      const existingSet = new Set((existing ?? []).map((e) => e.source_url as string))
      const fresh = candidates.filter((c) => !existingSet.has(c.source_url))
      outcome.duplicates += candidates.length - fresh.length

      if (fresh.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from('submissions')
          .upsert(fresh, { onConflict: 'source_url', ignoreDuplicates: true })
          .select('id')
        if (insErr) {
          outcome.errors.push({ artist: artist.name, error: `insert: ${insErr.message}` })
        } else {
          const insertedCount = inserted?.length ?? 0
          outcome.published += insertedCount
          // Shortfall vs. fresh = a concurrent run won the race → duplicate.
          const raceSkipped = fresh.length - insertedCount
          if (raceSkipped > 0) outcome.duplicates += raceSkipped
        }
      }
    }
  }

  // Stamp last_scanned_at: we observed this artist's current Spotify state.
  // RLS gates this UPDATE via is_admin() — non-admins update zero rows. Stamp
  // errors are non-fatal: surface in errors[] so the run keeps going.
  const { error: stampErr } = await supabase
    .from('artists')
    .update({ last_scanned_at: new Date().toISOString() })
    .eq('id', artist.id)
  if (stampErr) {
    outcome.errors.push({
      artist: artist.name,
      error: `stamp last_scanned_at: ${stampErr.message}`,
    })
  }

  return outcome
}
