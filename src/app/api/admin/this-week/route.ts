import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RawRow = {
  id: string
  position: number
  submission_id: string | null
  source_url: string | null
  title: string | null
  artist_name: string | null
  artwork_url: string | null
  created_at: string
  updated_at: string
  submission:
    | {
        id: string
        title: string
        artwork_url: string | null
        cover_image_url: string | null
        source_url: string | null
        release_date: string | null
        artists: { name: string } | { name: string }[] | null
      }
    | null
}

const SELECT = `
  id, position, submission_id, source_url, title, artist_name, artwork_url, created_at, updated_at,
  submission:submissions!submission_id(
    id, title, artwork_url, cover_image_url, source_url, release_date,
    artists:primary_artist_id(name)
  )
`

function resolveRow(row: RawRow) {
  const sub = row.submission
  const subArtist = sub
    ? Array.isArray(sub.artists)
      ? (sub.artists[0]?.name ?? null)
      : (sub.artists?.name ?? null)
    : null
  const title = sub?.title ?? row.title ?? ''
  const artistName = subArtist ?? row.artist_name ?? null
  const artworkUrl =
    sub?.artwork_url ?? sub?.cover_image_url ?? row.artwork_url ?? null
  const sourceUrl = sub?.source_url ?? row.source_url ?? null
  const releaseUrl = sub ? `/release/${sub.id}` : null
  return {
    id: row.id,
    position: row.position,
    submission_id: row.submission_id,
    title,
    artist_name: artistName,
    artwork_url: artworkUrl,
    source_url: sourceUrl,
    release_url: releaseUrl,
    release_date: sub?.release_date ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('bass_this_week')
    .select(SELECT)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = ((data ?? []) as unknown as RawRow[]).map(resolveRow)
  return NextResponse.json({ items })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const submissionId =
    typeof body.submission_id === 'string' ? body.submission_id.trim() : ''
  if (!submissionId) {
    return NextResponse.json(
      { error: 'submission_id is required' },
      { status: 400 },
    )
  }

  const { data: sub, error: subErr } = await supabase
    .from('submissions')
    .select('id')
    .eq('id', submissionId)
    .maybeSingle()
  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }
  if (!sub) {
    return NextResponse.json(
      { error: `No submission with id ${submissionId}` },
      { status: 404 },
    )
  }

  const { data: existing } = await supabase
    .from('bass_this_week')
    .select('id')
    .eq('submission_id', submissionId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'Submission is already in This Week' },
      { status: 409 },
    )
  }

  const { data: maxRow } = await supabase
    .from('bass_this_week')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('bass_this_week')
    .insert({ submission_id: submissionId, position: nextPosition })
    .select(SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { item: resolveRow(data as unknown as RawRow) },
    { status: 201 },
  )
}
