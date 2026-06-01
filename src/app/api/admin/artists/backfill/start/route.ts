import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchSpotifyArtist } from '@/lib/spotify'

const DELAY_MS = 150 // Politeness delay between Spotify API calls
const BATCH_LIMIT = 2000 // Safety ceiling for one backfill run

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for existing running job
  const { data: existing } = await supabase
    .from('backfill_jobs')
    .select('id, status')
    .eq('status', 'running')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      error: 'A backfill job is already running. Wait for it to finish or refresh the page.',
      jobId: existing.id,
    }, { status: 409 })
  }

  // Find artists that need backfilling: have Spotify ID, missing image_url
  const { data: candidates, error: queryError } = await supabase
    .from('artists')
    .select('id, name, spotify_artist_id, private_notes')
    .not('spotify_artist_id', 'is', null)
    .is('image_url', null)
    .limit(BATCH_LIMIT)

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const targets = (candidates ?? []).filter(
    (c) => typeof c.spotify_artist_id === 'string' && c.spotify_artist_id.length > 0
  )

  if (targets.length === 0) {
    return NextResponse.json({
      message: 'No artists need backfilling',
      total: 0,
    })
  }

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from('backfill_jobs')
    .insert({
      job_type: 'artist_metadata_spotify',
      status: 'running',
      started_by: user.id,
      total_count: targets.length,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || 'Failed to create job' }, { status: 500 })
  }

  const jobId = job.id

  // Kick off background processing — do NOT await
  // This works because Vercel functions run until the response is sent + a grace period,
  // and we'll poll for progress separately.
  ;(async () => {
    let successCount = 0
    let errorCount = 0
    const today = new Date().toISOString().slice(0, 10)

    for (let i = 0; i < targets.length; i++) {
      const artist = targets[i]
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
        console.error(`Backfill failed for artist ${artist.name}:`, msg)
        await supabase
          .from('backfill_jobs')
          .update({
            last_error: `${artist.name}: ${msg.slice(0, 200)}`,
          })
          .eq('id', jobId)
      }

      // Update progress every artist
      await supabase
        .from('backfill_jobs')
        .update({
          processed_count: i + 1,
          success_count: successCount,
          error_count: errorCount,
          last_processed_artist_name: artist.name,
        })
        .eq('id', jobId)

      await sleep(DELAY_MS)
    }

    // Mark complete
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  })().catch(async (err) => {
    console.error('Backfill background task fatal error:', err)
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : 'Fatal error',
      })
      .eq('id', jobId)
  })

  // Return immediately with the job ID
  return NextResponse.json({
    jobId,
    total: targets.length,
    message: 'Backfill started',
  })
}
