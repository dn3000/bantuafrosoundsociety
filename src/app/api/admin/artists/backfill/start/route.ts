import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/spotify'

const CHUNK_SIZE = 25
const BASE_DELAY_MS = 300
const MAX_RETRIES_PER_ARTIST = 2
const ABORT_CHUNK_AT_ERROR_RATE = 0.5 // Abort chunk if >50% of attempts fail

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchResult =
  | { ok: true; imageUrl: string | null; genres: string[]; followers: number; popularity: number }
  | { ok: false; error: string; rateLimited: boolean; retryAfter: number }

async function fetchSpotifyArtistWithRetry(
  artistId: string,
  token: string,
  retries = MAX_RETRIES_PER_ARTIST
): Promise<FetchResult> {
  for (let attempt = 0; attempt <= retries; attempt++) {
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

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
      if (attempt < retries) {
        await sleep((retryAfter + 1) * 1000)
        continue
      }
      return { ok: false, error: `Rate limited (429), retry-after ${retryAfter}s`, rateLimited: true, retryAfter }
    }

    const body = await res.text().catch(() => '')
    return {
      ok: false,
      error: `Spotify ${res.status}: ${body.slice(0, 150)}`,
      rateLimited: false,
      retryAfter: 0,
    }
  }
  return { ok: false, error: 'Exhausted retries', rateLimited: false, retryAfter: 0 }
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

  // Get Spotify token once for the whole chunk
  let token: string
  try {
    token = await getAccessToken()
  } catch (err) {
    return NextResponse.json({
      error: `Spotify token error: ${err instanceof Error ? err.message : 'unknown'}`,
    }, { status: 502 })
  }

  let successCount = job.success_count
  let errorCount = job.error_count
  let lastError: string | null = job.last_error
  let lastArtistName: string | null = job.last_processed_artist_name
  let processedThisChunk = 0
  let errorsThisChunk = 0
  const today = new Date().toISOString().slice(0, 10)
  let aborted = false
  let abortReason: string | null = null

  for (const artist of targets) {
    // Safety check: bail if too many errors in this chunk
    if (processedThisChunk >= 5 && errorsThisChunk / processedThisChunk >= ABORT_CHUNK_AT_ERROR_RATE) {
      aborted = true
      abortReason = `Aborted chunk: ${errorsThisChunk}/${processedThisChunk} errors (>= ${ABORT_CHUNK_AT_ERROR_RATE * 100}%). Likely rate-limited.`
      break
    }

    const result = await fetchSpotifyArtistWithRetry(artist.spotify_artist_id as string, token)

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
        errorsThisChunk++
        lastError = `${artist.name}: DB update failed - ${updateError.message}`
      } else {
        successCount++
      }
    } else {
      errorCount++
      errorsThisChunk++
      lastError = `${artist.name}: ${result.error}`

      // If artist has no image and persistently fails, mark image_url with a sentinel
      // so we don't keep retrying them every chunk
      if (!result.rateLimited) {
        await supabase
          .from('artists')
          .update({
            image_url: 'no_spotify_image',
            private_notes: artist.private_notes
              ? `${artist.private_notes}\nBackfill ${today}: marked no_spotify_image after error: ${result.error.slice(0, 100)}`
              : `Backfill ${today}: marked no_spotify_image after error: ${result.error.slice(0, 100)}`,
          })
          .eq('id', artist.id)
      }
    }

    processedThisChunk++
    lastArtistName = artist.name

    await sleep(BASE_DELAY_MS)
  }

  // Compute actual processed count: remaining unprocessed candidates
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
    processedThisChunk,
    errorsThisChunk,
    totalProcessed: actualProcessed,
    total: job.total_count,
    aborted,
    abortReason,
    remaining: stillRemaining ?? 0,
  })
}
