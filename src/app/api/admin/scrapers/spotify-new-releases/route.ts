import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/spotify'
import {
  DEFAULT_SINCE_DATE,
  SCRAPE_DELAY_MS,
  SPOTIFY_MARKET,
  albumToSubmissionRow,
  fetchArtistReleasesSince,
  fetchBackfillMeta,
  resolveSubmissionRef,
  type SubmissionScrapeRow,
} from '@/lib/spotifyNewReleases'

// Spotify scraper that fills the submissions review queue with PENDING items.
// NEVER auto-approves or publishes. Chunked + cursor so runs stay under Vercel limits.
export const runtime = 'nodejs' // getAccessToken() uses Buffer
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Each artist now costs several Spotify calls (the app caps album-list pages at
// 10, so we paginate per include_group). Keep the default chunk modest to stay
// under Vercel's function timeout; the cursor/nextCursor loop covers the rest.
const DEFAULT_LIMIT_ARTISTS = 15
const MAX_LIMIT_ARTISTS = 50
const VALID_TIERS = ['featured', 'active', 'watch'] as const
const BACKFILL_DEFAULT_LIMIT = 50
const BACKFILL_MAX_LIMIT = 200

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ScrapeError = { artist?: string; id?: string; error: string }

function isValidSinceDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Get a Client Credentials token up front (fail fast if Spotify auth is broken).
  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    return NextResponse.json(
      { error: `Spotify auth failed: ${err instanceof Error ? err.message : 'unknown'}`, aborted: true },
      { status: 502 }
    )
  }

  if (body.mode === 'backfill') {
    return handleBackfill(supabase, token, body)
  }

  // ---------------- SCAN (default) ----------------
  const tier = typeof body.tier === 'string' ? body.tier : null
  if (tier && !(VALID_TIERS as readonly string[]).includes(tier)) {
    return NextResponse.json({ error: `Invalid tier (use one of ${VALID_TIERS.join(', ')})` }, { status: 400 })
  }
  const limitArtists = Math.min(
    Math.max(typeof body.limitArtists === 'number' ? body.limitArtists : DEFAULT_LIMIT_ARTISTS, 1),
    MAX_LIMIT_ARTISTS
  )
  const cursor = Math.max(typeof body.cursor === 'number' ? body.cursor : 0, 0)
  const sinceDate = isValidSinceDate(body.sinceDate) ? body.sinceDate : DEFAULT_SINCE_DATE
  // Pacing knob: raise it for the full ~940-artist run if Spotify pushes back.
  const delayMs = Math.min(Math.max(typeof body.delayMs === 'number' ? body.delayMs : SCRAPE_DELAY_MS, 100), 5000)

  // Whitelist: tracked artists with a Spotify ID (+ optional tier). Stable order by id.
  let query = supabase
    .from('artists')
    .select('id, name, spotify_artist_id', { count: 'exact' })
    .eq('is_tracked', true)
    .not('spotify_artist_id', 'is', null)
    .order('id', { ascending: true })
  if (tier) query = query.eq('tier', tier)

  const { data: artists, count: totalWhitelist, error: artistsError } = await query.range(
    cursor,
    cursor + limitArtists - 1
  )
  if (artistsError) {
    return NextResponse.json({ error: artistsError.message }, { status: 500 })
  }

  let artistsScanned = 0
  let releasesSeen = 0
  let queued = 0
  let skippedDuplicates = 0
  let skippedOld = 0
  const errors: ScrapeError[] = []
  const warnings: ScrapeError[] = []
  let rateLimited = false
  let abortedAtIndex: number | null = null

  const targets = (artists ?? []).filter((a) => typeof a.spotify_artist_id === 'string' && a.spotify_artist_id)

  for (let i = 0; i < targets.length; i++) {
    const artist = targets[i]
    artistsScanned++

    const result = await fetchArtistReleasesSince(artist.spotify_artist_id as string, token, {
      sinceDate,
      market: SPOTIFY_MARKET,
      pageSize: 10,
      delayMs,
    })

    if (!result.ok) {
      if (result.rateLimited) {
        // Mirror the backfill pattern: stop immediately, surface a resumable cursor.
        rateLimited = true
        abortedAtIndex = i
        errors.push({ artist: artist.name, error: `Rate limited (429)${result.retryAfter ? `, retry after ${result.retryAfter}s` : ''}` })
        break
      }
      errors.push({ artist: artist.name, error: result.error })
      await sleep(delayMs)
      continue
    }

    // No silent truncation: flag artists whose release list hit the page cap.
    if (result.cappedGroups.length > 0) {
      warnings.push({ artist: artist.name, error: `Page cap hit for groups: ${result.cappedGroups.join(', ')} — some older releases may not have been scanned` })
    }

    releasesSeen += result.items.length

    // Transform + sinceDate filter + intra-artist dedup by source_url.
    const seen = new Set<string>()
    const candidates: SubmissionScrapeRow[] = []
    for (const album of result.items) {
      const mapped = albumToSubmissionRow(album, artist.id as string, sinceDate)
      if ('skip' in mapped) {
        if (mapped.skip === 'old') skippedOld++
        continue
      }
      if (seen.has(mapped.row.source_url)) continue
      seen.add(mapped.row.source_url)
      candidates.push(mapped.row)
    }

    if (candidates.length > 0) {
      // Dedup against existing rows first (clear counting), then upsert with
      // ON CONFLICT DO NOTHING as a race guard.
      const urls = candidates.map((c) => c.source_url)
      const { data: existing, error: existErr } = await supabase
        .from('submissions')
        .select('source_url')
        .in('source_url', urls)
      if (existErr) {
        errors.push({ artist: artist.name, error: `dedup check: ${existErr.message}` })
        await sleep(delayMs)
        continue
      }
      const existingSet = new Set((existing ?? []).map((e) => e.source_url as string))
      const fresh = candidates.filter((c) => !existingSet.has(c.source_url))
      skippedDuplicates += candidates.length - fresh.length

      if (fresh.length > 0) {
        const { data: inserted, error: insErr } = await supabase
          .from('submissions')
          .upsert(fresh, { onConflict: 'source_url', ignoreDuplicates: true })
          .select('id')
        if (insErr) {
          errors.push({ artist: artist.name, error: `insert: ${insErr.message}` })
        } else {
          const insertedCount = inserted?.length ?? 0
          queued += insertedCount
          // Any shortfall vs. fresh means a concurrent run won the race -> duplicate.
          const raceSkipped = fresh.length - insertedCount
          if (raceSkipped > 0) skippedDuplicates += raceSkipped
        }
      }
    }

    await sleep(delayMs)
  }

  // Cursor for resuming. On a rate-limit abort, resume at the artist that failed
  // (dedup makes reprocessing safe). Otherwise advance past this chunk.
  let nextCursor: number | null
  if (rateLimited && abortedAtIndex !== null) {
    nextCursor = cursor + abortedAtIndex
  } else {
    const consumed = cursor + (artists?.length ?? 0)
    nextCursor = consumed < (totalWhitelist ?? 0) ? consumed : null
  }

  return NextResponse.json({
    mode: 'scan',
    tier: tier ?? null,
    sinceDate,
    cursor,
    limitArtists,
    totalWhitelist: totalWhitelist ?? 0,
    artistsScanned,
    releasesSeen,
    queued,
    skippedDuplicates,
    skippedOld,
    errors,
    warnings,
    rateLimited,
    nextCursor,
  })
}

// ---------------- BACKFILL ----------------
// Fill release_date + embed_url for existing spotify submissions where
// release_date IS NULL. Only fills NULLs; never overwrites; touches nothing else.
async function handleBackfill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  token: string,
  body: Record<string, unknown>
) {
  const limit = Math.min(
    Math.max(typeof body.limitArtists === 'number' ? body.limitArtists : BACKFILL_DEFAULT_LIMIT, 1),
    BACKFILL_MAX_LIMIT
  )

  const { data: rows, error } = await supabase
    .from('submissions')
    .select('id, source_url, platform_id, embed_url, release_date')
    .eq('source', 'spotify')
    .is('release_date', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let scanned = 0
  let filled = 0
  let skipped = 0
  const errors: ScrapeError[] = []
  let rateLimited = false

  for (const row of rows ?? []) {
    scanned++
    const ref = resolveSubmissionRef(row)
    if (!ref) {
      skipped++
      errors.push({ id: row.id as string, error: 'Could not resolve a Spotify id from source_url/platform_id' })
      continue
    }

    const meta = await fetchBackfillMeta(ref, token)
    if (!meta.ok) {
      if (meta.rateLimited) {
        rateLimited = true
        errors.push({ id: row.id as string, error: 'Rate limited (429) — wait and resume' })
        break
      }
      errors.push({ id: row.id as string, error: meta.error })
      await sleep(SCRAPE_DELAY_MS)
      continue
    }

    // Only fill columns that are currently NULL. Never overwrite.
    const update: Record<string, string> = {}
    if (row.release_date == null && meta.releaseDate) update.release_date = meta.releaseDate
    if (row.embed_url == null && meta.embedUrl) update.embed_url = meta.embedUrl

    if (Object.keys(update).length === 0) {
      skipped++
    } else {
      const { error: updErr } = await supabase.from('submissions').update(update).eq('id', row.id)
      if (updErr) {
        errors.push({ id: row.id as string, error: `update: ${updErr.message}` })
      } else {
        filled++
      }
    }

    await sleep(SCRAPE_DELAY_MS)
  }

  return NextResponse.json({
    mode: 'backfill',
    scanned,
    filled,
    skipped,
    errors,
    rateLimited,
    // If we filled a full page there may be more rows next time.
    nextCursor: (rows?.length ?? 0) === limit ? 0 : null,
  })
}
