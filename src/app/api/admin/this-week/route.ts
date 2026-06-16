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

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
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

  const submissionId = strOrNull(body.submission_id)
  const insertPayload: Record<string, unknown> = {}

  if (submissionId) {
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
    insertPayload.submission_id = submissionId
  } else {
    const sourceUrl = strOrNull(body.source_url)
    const title = strOrNull(body.title)
    if (!sourceUrl || !title) {
      return NextResponse.json(
        { error: 'source_url and title are required for standalone items' },
        { status: 400 },
      )
    }
    try {
      const u = new URL(sourceUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return NextResponse.json({ error: 'source_url must be http(s)' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'source_url is not a valid URL' }, { status: 400 })
    }
    insertPayload.source_url = sourceUrl
    insertPayload.title = title
    insertPayload.artist_name = strOrNull(body.artist_name)
    insertPayload.artwork_url = strOrNull(body.artwork_url)
  }

  const { data: maxRow } = await supabase
    .from('bass_this_week')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  insertPayload.position = (maxRow?.position ?? -1) + 1

  const { data, error } = await supabase
    .from('bass_this_week')
    .insert(insertPayload)
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
