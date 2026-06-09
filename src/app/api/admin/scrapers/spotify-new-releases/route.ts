import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/spotify'
import {
  DEFAULT_SINCE_DATE,
  SCRAPE_DELAY_MS,
  fetchBackfillMeta,
  resolveSubmissionRef,
} from '@/lib/spotifyNewReleases'
import { processArtistScrape, type ScrapeNote } from '@/lib/spotifyArtistScrape'

// Spotify scraper for tracked (whitelisted) artists. Scraped drops auto-publish:
// rows are inserted as status='approved' and are immediately public. Chunked +
// cursor so runs stay under Vercel limits. (The manual submission form still
// writes status='pending' — auto-publish is scraper-only.)
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
  // Auto-publish: scraped drops are written as status='approved'. One approval
  // timestamp per scan call, shared by every row this chunk inserts.
  const approvedAt = new Date().toISOString()

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
  const errors: ScrapeNote[] = []
  const warnings: ScrapeNote[] = []
  let rateLimited = false
  let abortedAtIndex: number | null = null
  // Retry-After (seconds) from a 429, and whether this chunk made any successful
  // (non-429) Spotify call before stopping — both drive the client's back-off.
  let retryAfterSeconds: number | null = null
  let madeProgress = false
  // Additive telemetry: per-artist summaries the client uses for an activity feed.
  // Only artists with a successful scrape land here; 429-aborts and live errors
  // are surfaced via errors[] / warnings[] instead.
  const chunkArtists: { id: string; name: string; published: number; duplicates: number; oldSkipped: number }[] = []

  const targets = (artists ?? []).filter((a) => typeof a.spotify_artist_id === 'string' && a.spotify_artist_id)

  for (let i = 0; i < targets.length; i++) {
    const artist = targets[i]
    artistsScanned++

    const outcome = await processArtistScrape(
      supabase,
      token,
      { id: artist.id as string, name: artist.name as string, spotify_artist_id: artist.spotify_artist_id as string },
      sinceDate,
      approvedAt,
      delayMs,
    )

    releasesSeen += outcome.releasesSeen
    queued += outcome.published
    skippedDuplicates += outcome.duplicates
    skippedOld += outcome.oldSkipped
    if (outcome.errors.length > 0) errors.push(...outcome.errors)
    if (outcome.cappedGroups.length > 0) {
      warnings.push({
        artist: artist.name as string,
        error: `Page cap hit for groups: ${outcome.cappedGroups.join(', ')} — some older releases may not have been scanned`,
      })
    }
    if (outcome.madeProgress) madeProgress = true

    if (outcome.rateLimited) {
      // Stop this chunk immediately and surface a resumable cursor + the
      // Retry-After so the client backs off correctly.
      rateLimited = true
      retryAfterSeconds = outcome.retryAfter
      abortedAtIndex = i
      break
    }

    if (outcome.scrapeOk) {
      chunkArtists.push({
        id: artist.id as string,
        name: artist.name as string,
        published: outcome.published,
        duplicates: outcome.duplicates,
        oldSkipped: outcome.oldSkipped,
      })
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
    retryAfter: retryAfterSeconds,
    madeProgress,
    nextCursor,
    chunkArtists,
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
  const errors: ScrapeNote[] = []
  let rateLimited = false
  let retryAfterSeconds: number | null = null
  let madeProgress = false

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
        retryAfterSeconds = meta.retryAfter
        errors.push({ id: row.id as string, error: `Rate limited (429)${meta.retryAfter ? `, retry after ${meta.retryAfter}s` : ''}` })
        break
      }
      // Non-429 error = live response → progress for consecutive-429 detection.
      madeProgress = true
      errors.push({ id: row.id as string, error: meta.error })
      await sleep(SCRAPE_DELAY_MS)
      continue
    }

    madeProgress = true

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
    retryAfter: retryAfterSeconds,
    madeProgress,
    // If we filled a full page there may be more rows next time.
    nextCursor: (rows?.length ?? 0) === limit ? 0 : null,
  })
}
