import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/spotify'
import { DEFAULT_SINCE_DATE } from '@/lib/spotifyNewReleases'
import { processArtistScrape } from '@/lib/spotifyArtistScrape'

// Single-artist Spotify scan — the "Scan now" button on the artists admin page.
// Reuses the same per-artist helper the bulk scraper uses (auto-publish, dedup,
// back-off, pagination smart-stop, last_scanned_at stamp). One artist in, one
// shaped response out.
//
// Routing note: the parent dynamic segment is named [slug] for compatibility
// with the existing /api/admin/artists/[slug] CRUD routes (Next.js segment
// names must match within a path level). Per the API contract the param IS the
// artist's UUID id — the bulk scraper, the admin UI, and the chunkArtists
// telemetry all key on id, so the scan button passes id too. Looking up by id
// keeps the trigger lockstep with what the admin actually clicked on, instead
// of round-tripping through a slug.
//
// Auth: same as the bulk scraper and the bulk track/untrack endpoint —
// authenticate the request, then let RLS gate the writes via is_admin() on
// artists/submissions. No bespoke user_roles read (that broke other endpoints).

export const runtime = 'nodejs' // getAccessToken() uses Buffer
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isValidSinceDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug: id } = await context.params

  let body: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sinceDate = isValidSinceDate(body.sinceDate) ? body.sinceDate : DEFAULT_SINCE_DATE
  // Same pacing window as the bulk route: 100–5000ms, default 2000ms here
  // (a hand-triggered single scan can afford slightly slower pacing than the
  // bulk loop's 800ms default).
  const delayMs = Math.min(
    Math.max(typeof body.delayMs === 'number' ? body.delayMs : 2000, 100),
    5000,
  )

  // Look up the artist by id (see routing note). 404 if missing.
  const { data: artist, error: lookupError } = await supabase
    .from('artists')
    .select('id, name, spotify_artist_id')
    .eq('id', id)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }
  if (!artist.spotify_artist_id) {
    return NextResponse.json(
      { error: 'Artist has no Spotify ID — cannot scan' },
      { status: 422 },
    )
  }

  // Spotify auth — fail fast (matches the bulk route).
  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    return NextResponse.json(
      { error: `Spotify auth failed: ${err instanceof Error ? err.message : 'unknown'}`, aborted: true },
      { status: 502 },
    )
  }

  const approvedAt = new Date().toISOString()
  const outcome = await processArtistScrape(
    supabase,
    token,
    {
      id: artist.id as string,
      name: artist.name as string,
      spotify_artist_id: artist.spotify_artist_id as string,
    },
    sinceDate,
    approvedAt,
    delayMs,
  )

  return NextResponse.json({
    processed: 1,
    published: outcome.published,
    duplicates: outcome.duplicates,
    oldSkipped: outcome.oldSkipped,
    errors: outcome.errors,
    rateLimited: outcome.rateLimited,
    retryAfter: outcome.retryAfter,
    pagesFetched: outcome.pagesFetched,
  })
}
