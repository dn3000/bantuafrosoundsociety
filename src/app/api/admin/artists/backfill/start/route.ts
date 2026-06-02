import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/spotify'

const CHUNK_SIZE = 10  // Small chunks to stay well under Vercel limits
const DELAY_MS = 400   // ~2.5 req/sec sustained — comfortable for Spotify

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchResult =
  | { ok: true; imageUrl: string | null; genres: string[]; followers: number; popularity: number }
  | { ok: false; error: string; rateLimited: boolean }

async function fetchSpotifyArtist(
  artistId: string,
  token: string
): Promise<FetchResult> {
  const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.ok) {
    const data = await res.json() as {
      genres: string[]
      images: { url: string; width: number }[]
      followers: { total: number }
      popularity: number
    }
    const sorted = [...(data.images || [])].sort((a, b) => (b.width || 0) - (a.width || 0))
    return {
      ok: true,
      imageUrl: sorted[0]?.url || null,
      genres: data.genres || [],
      followers: data.followers?.total ?? 0,
      popularity: data.popularity ?? 0,
    }
  }

  // Fail fast — do NOT retry in this function
  if (res.status === 429) {
    return { ok: false, error: 'Rate limited (429)', rateLimited: true }
  }

  const body = await res.text().catch(() => '')
  return {
    ok: false,
    error: `Spotify ${res.status}: ${body.slice(0, 100)}`,
    rateLimited: false,
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find or create the active job
  let { data: job } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('status', 'running')
    .maybeSingle()

  if (!job) {
    const { count: totalCandidates } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .not('spotify_artist_id', 'is', null)
      .is('image_url', null)

    if (!totalCandidates || totalCandidates === 0) {
      return NextResponse.json({ message: 'No artists need backfilling', done: true, total: 0 })
    }

    const { data: newJob, error: jobError } = await supabase
      .from('backfill_jobs')
      .insert({
        job_type: 'artist_metadata_spotify',
        status: 'running',
        started_by: user.id,
        total_count: totalCandidates,
      })
      .select('*')
      .single()

    if (jobError || !newJob) {
      return NextResponse.json({ error: jobError?.message || 'Failed to create job' }, { status: 500 })
    }
    job = newJob
  }

  // Get Spotify token (fails fast if Spotify auth itself is broken)
  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    return NextResponse.json({
      jobId: job.id,
      done: false,
      aborted: true,
      abortReason: `Spotify auth failed: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // Preflight: use an artist from our DB that already has a valid image_url.
  // These have proven Spotify IDs (they returned 200 on previous backfill runs).
  // If none exist (first ever backfill), fall back to skipping the preflight.
  const { data: canaryArtist } = await supabase
    .from('artists')
    .select('spotify_artist_id, name')
    .not('image_url', 'is', null)
    .neq('image_url', 'no_spotify_image')
    .not('spotify_artist_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (canaryArtist?.spotify_artist_id) {
    const preflightRes = await fetch(
      `https://api.spotify.com/v1/artists/${canaryArtist.spotify_artist_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (preflightRes.status === 429) {
      return NextResponse.json({
        jobId: job.id,
        done: false,
        aborted: true,
        abortReason: 'Spotify is currently rate-limiting us. Wait 5-10 minutes and try again.',
        remaining: job.total_count - job.processed_count,
      })
    }
    if (!preflightRes.ok) {
      const body = await preflightRes.text().catch(() => '')
      return NextResponse.json({
        jobId: job.id,
        done: false,
        aborted: true,
        abortReason: `Spotify preflight failed for "${canaryArtist.name}" (${canaryArtist.spotify_artist_id}): ${preflightRes.status} ${body.slice(0, 150)}`,
      })
    }
  }
  // If no canary artist exists, skip preflight — we'll learn from the first real call

  // Fetch next chunk of candidates
  const { data: candidates } = await supabase
    .from('artists')
    .select('id, name, spotify_artist_id, private_notes')
    .not('spotify_artist_id', 'is', null)
    .is('image_url', null)
    .limit(CHUNK_SIZE)

  const targets = (candidates ?? []).filter(
    (c) => typeof c.spotify_artist_id === 'string' && c.spotify_artist_id.length > 0
  )

  if (targets.length === 0) {
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return NextResponse.json({ jobId: job.id, done: true, message: 'Backfill complete' })
  }

  let successCount = job.success_count
  let errorCount = job.error_count
  let lastError: string | null = job.last_error
  let lastArtistName: string | null = job.last_processed_artist_name
  let chunkRateLimited = false
  const today = new Date().toISOString().slice(0, 10)

  for (const artist of targets) {
    const result = await fetchSpotifyArtist(artist.spotify_artist_id as string, token)

    if (result.ok) {
      const auditLine = `Backfilled ${today}: Spotify followers ${result.followers.toLocaleString()}, popularity ${result.popularity}`
      const newNotes = artist.private_notes
        ? `${artist.private_notes}\n${auditLine}`
        : auditLine

      const { error: updateError } = await supabase
        .from('artists')
        .update({
          image_url: result.imageUrl || 'no_spotify_image',
          spotify_genres: result.genres,
          private_notes: newNotes,
        })
        .eq('id', artist.id)

      if (updateError) {
        errorCount++
        lastError = `${artist.name}: DB update - ${updateError.message}`
      } else {
        successCount++
      }
    } else if (result.rateLimited) {
      // Got 429 mid-chunk — exit immediately, don't burn more credit
      chunkRateLimited = true
      lastError = `Rate limited after ${artist.name}. Wait 5-10 min and resume.`
      break
    } else {
      // Non-429 error — mark sentinel and move on (don't retry next chunk)
      errorCount++
      lastError = `${artist.name}: ${result.error}`
      await supabase
        .from('artists')
        .update({
          image_url: 'no_spotify_image',
          private_notes: artist.private_notes
            ? `${artist.private_notes}\nBackfill ${today}: no_spotify_image (${result.error.slice(0, 80)})`
            : `Backfill ${today}: no_spotify_image (${result.error.slice(0, 80)})`,
        })
        .eq('id', artist.id)
    }

    lastArtistName = artist.name
    await sleep(DELAY_MS)
  }

  // Derive processed_count from "what's left" so it can't inflate
  const { count: stillRemaining } = await supabase
    .from('artists')
    .select('id', { count: 'exact', head: true })
    .not('spotify_artist_id', 'is', null)
    .is('image_url', null)

  const actualProcessed = job.total_count - (stillRemaining ?? 0)

  await supabase
    .from('backfill_jobs')
    .update({
      processed_count: actualProcessed,
      success_count: successCount,
      error_count: errorCount,
      last_processed_artist_name: lastArtistName,
      last_error: lastError,
    })
    .eq('id', job.id)

  return NextResponse.json({
    jobId: job.id,
    done: false,
    aborted: chunkRateLimited,
    abortReason: chunkRateLimited
      ? 'Spotify rate-limited us mid-chunk. Wait 5-10 minutes and click Resume.'
      : null,
    totalProcessed: actualProcessed,
    total: job.total_count,
    remaining: stillRemaining ?? 0,
  })
}
