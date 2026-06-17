import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getAccessToken } from '@/lib/spotify'
import { scrapePlaylist } from '@/lib/spotifyPlaylistScraper'

// Spotify playlist scraper. Additive sibling of the per-artist scraper route —
// one curated playlist (up to 100 tracks/call) covers what would take ~50
// per-artist album scans. Scraped drops auto-publish (status='approved') because
// the playlist is the trust gate. Chunked + cursor so each invocation stays under
// Vercel's function timeout; the UI feeds nextCursor back in until it's null.
//
// Auth mirrors artists/bulk EXACTLY: authenticate the request (401 if not), then
// let the database enforce admin via the is_admin() RLS policies on submissions /
// artists / tracked_playlists. A non-admin is blocked at the RLS layer (their
// writes touch zero rows / fail WITH CHECK). Do NOT add a bespoke user_roles read
// here — that was the 403 bug from commit 08cac8c.
export const runtime = 'nodejs' // getAccessToken() uses Buffer
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_SINCE_DATE = '2026-01-01'
const DEFAULT_DELAY_MS = 800
const DEFAULT_CHUNK = 5 // playlists per call — keep modest for the Vercel timeout
const MAX_CHUNK = 25

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidSinceDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

type PlaylistRow = { id: string; spotify_playlist_id: string; name: string | null }

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Fail fast if Spotify auth is broken (mirror the per-artist scraper route).
  try {
    await getAccessToken()
  } catch (err) {
    return NextResponse.json(
      { error: `Spotify auth failed: ${err instanceof Error ? err.message : 'unknown'}`, aborted: true },
      { status: 502 }
    )
  }

  const sinceDate = isValidSinceDate(body.sinceDate) ? body.sinceDate : DEFAULT_SINCE_DATE
  const delayMs = Math.min(Math.max(typeof body.delayMs === 'number' ? body.delayMs : DEFAULT_DELAY_MS, 100), 5000)
  const chunkSize = Math.min(Math.max(typeof body.chunkSize === 'number' ? body.chunkSize : DEFAULT_CHUNK, 1), MAX_CHUNK)
  const cursor = Math.max(typeof body.cursor === 'number' ? body.cursor : 0, 0)
  const playlistIds = Array.isArray(body.playlistIds)
    ? body.playlistIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : null
  // Auto-publish: one approval timestamp per call, shared by every row inserted.
  const approvedAt = new Date().toISOString()

  // Resolve the playlist set for this chunk. Explicit ids scan exactly those rows
  // (whatever their active state); otherwise scan all is_active playlists. Stable
  // order so the cursor is meaningful across calls.
  let query = supabase
    .from('tracked_playlists')
    .select('id, spotify_playlist_id, name', { count: 'exact' })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (playlistIds && playlistIds.length > 0) query = query.in('id', playlistIds)
  else query = query.eq('is_active', true)

  const { data: playlists, count: totalPlaylists, error: listErr } = await query.range(
    cursor,
    cursor + chunkSize - 1
  )
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const targets = (playlists ?? []) as PlaylistRow[]

  let playlistsScanned = 0
  let processed = 0
  let published = 0
  let duplicates = 0
  let oldSkipped = 0
  let pagesFetched = 0
  const errors: { playlist?: string; error: string }[] = []
  let rateLimited = false
  let retryAfterSeconds: number | null = null
  let madeProgress = false
  let abortedAtIndex: number | null = null

  for (let i = 0; i < targets.length; i++) {
    const pl = targets[i]
    playlistsScanned++

    const r = await scrapePlaylist(supabase, pl.spotify_playlist_id, {
      sinceDate,
      delayMs,
      approvedAt,
      playlistName: pl.name,
      addedBy: user.id,
    })

    processed += r.processed
    published += r.published
    duplicates += r.duplicates
    oldSkipped += r.oldSkipped
    pagesFetched += r.pagesFetched
    for (const e of r.errors) {
      errors.push({ playlist: pl.name ?? pl.spotify_playlist_id, error: e.context ? `${e.context}: ${e.error}` : e.error })
    }

    if (r.rateLimited) {
      // Stop the chunk and surface a resumable cursor + Retry-After so the client
      // backs off. A 429 that fetched >=1 page first still counts as progress.
      if (r.pagesFetched > 0) madeProgress = true
      rateLimited = true
      retryAfterSeconds = r.retryAfter
      abortedAtIndex = i
      errors.push({
        playlist: pl.name ?? pl.spotify_playlist_id,
        error: `Rate limited (429)${r.retryAfter ? `, retry after ${r.retryAfter}s` : ''}`,
      })
      break
    }

    // A live (non-429) response — success or a per-playlist error — is progress,
    // and the playlist's scan completed, so stamp its last_scanned_at.
    madeProgress = true
    await supabase.from('tracked_playlists').update({ last_scanned_at: new Date().toISOString() }).eq('id', pl.id)

    await sleep(delayMs)
  }

  // Cursor for resuming. On a 429 abort, resume at the playlist that failed
  // (album-level + source_url dedup make reprocessing safe). Otherwise advance.
  let nextCursor: number | null
  if (rateLimited && abortedAtIndex !== null) {
    nextCursor = cursor + abortedAtIndex
  } else {
    const consumed = cursor + targets.length
    nextCursor = consumed < (totalPlaylists ?? 0) ? consumed : null
  }

  return NextResponse.json({
    sinceDate,
    cursor,
    chunkSize,
    totalPlaylists: totalPlaylists ?? 0,
    playlistsScanned,
    processed,
    published,
    duplicates,
    oldSkipped,
    pagesFetched,
    errors,
    rateLimited,
    retryAfter: retryAfterSeconds,
    madeProgress,
    nextCursor,
  })
}
