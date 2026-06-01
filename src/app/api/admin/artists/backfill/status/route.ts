import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

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

  // No jobId — return most recent job (running or otherwise)
  const { data } = await supabase
    .from('backfill_jobs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Also count candidates needing backfill
  const { count } = await supabase
    .from('artists')
    .select('id', { count: 'exact', head: true })
    .not('spotify_artist_id', 'is', null)
    .is('image_url', null)

  return NextResponse.json({
    job: data || null,
    candidatesNeedingBackfill: count ?? 0,
  })
}
