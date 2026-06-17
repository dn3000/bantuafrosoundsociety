import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  const jobType = searchParams.get('jobType') || 'artist_metadata_spotify'

  if (jobId) {
    const { data, error } = await supabase
      .from('backfill_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json({ job: data })
  }

  // Most recent job of this type
  const { data: job } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('job_type', jobType)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Candidates count varies by job type
  let candidatesNeedingBackfill = 0
  if (jobType === 'artist_metadata_spotify') {
    const { count } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .not('spotify_artist_id', 'is', null)
      .is('image_url', null)
    candidatesNeedingBackfill = count ?? 0
  } else if (jobType === 'artist_musicbrainz') {
    const { count } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .not('spotify_artist_id', 'is', null)
      .is('musicbrainz_artist_id', null)
    candidatesNeedingBackfill = count ?? 0
  }

  return NextResponse.json({
    job: job || null,
    candidatesNeedingBackfill,
  })
}
