import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchSpotifyArtist } from '@/lib/spotify'

const CHUNK_SIZE = 50
const DELAY_MS = 100

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find or create the active job for this user
  let { data: job } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('status', 'running')
    .maybeSingle()

  if (!job) {
    // Count total candidates to set total_count properly on first chunk
    const { count: totalCandidates } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .not('spotify_artist_id', 'is', null)
      .is('image_url', null)

    if (!totalCandidates || totalCandidates === 0) {
      return NextResponse.json({
        message: 'No artists need backfilling',
        done: true,
        total: 0,
      })
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

  // Fetch next chunk of artists needing backfill
  const { data: candidates } = await supabase
    .from('artists')
    .select('id, name, spotify_artist_id, private_notes')
    .not('spotify_artist_id', 'is', null)
    .is('image_url', null)
    .limit(CHUNK_SIZE)

  const targets = (candidates ?? []).filter(
    (c) => typeof c.spotify_artist_id === 'string' && c.spotify_artist_id.length > 0
  )

  // If no more candidates, mark complete
  if (targets.length === 0) {
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      jobId: job.id,
      done: true,
      message: 'Backfill complete',
    })
  }

  let successCount = job.success_count
  let errorCount = job.error_count
  let lastError: string | null = job.last_error
  let lastArtistName: string | null = job.last_processed_artist_name
  let processedCount = job.processed_count
  const today = new Date().toISOString().slice(0, 10)

  for (const artist of targets) {
    try {
      const spotifyData = await fetchSpotifyArtist(artist.spotify_artist_id as string)
      const auditLine = `Backfilled ${today}: Spotify followers ${spotifyData.followers.toLocaleString()}, popularity ${spotifyData.popularity}`
      const newNotes = artist.private_notes
        ? `${artist.private_notes}\n${auditLine}`
        : auditLine

      await supabase
        .from('artists')
        .update({
          image_url: spotifyData.imageUrl,
          spotify_genres: spotifyData.genres,
          private_notes: newNotes,
        })
        .eq('id', artist.id)

      successCount++
    } catch (err) {
      errorCount++
      const msg = err instanceof Error ? err.message : 'Unknown error'
      lastError = `${artist.name}: ${msg.slice(0, 200)}`
      console.error(`Backfill failed for artist ${artist.name}:`, msg)
    }

    processedCount++
    lastArtistName = artist.name

    if (DELAY_MS > 0) await sleep(DELAY_MS)
  }

  // Update progress for this chunk
  await supabase
    .from('backfill_jobs')
    .update({
      processed_count: processedCount,
      success_count: successCount,
      error_count: errorCount,
      last_processed_artist_name: lastArtistName,
      last_error: lastError,
    })
    .eq('id', job.id)

  return NextResponse.json({
    jobId: job.id,
    done: false,
    processedThisChunk: targets.length,
    totalProcessed: processedCount,
    total: job.total_count,
  })
}
