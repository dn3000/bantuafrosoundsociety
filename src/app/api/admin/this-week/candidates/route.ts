import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const CANDIDATE_LIMIT = 50

type SubmissionRow = {
  id: string
  title: string
  artwork_url: string | null
  cover_image_url: string | null
  artists: { name: string } | { name: string }[] | null
}

function isRenderable(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function pickImage(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) if (isRenderable(c)) return c as string
  return null
}

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  const { data: usedRows, error: usedErr } = await supabase
    .from('bass_this_week')
    .select('submission_id')
    .not('submission_id', 'is', null)
  if (usedErr) {
    return NextResponse.json({ error: usedErr.message }, { status: 500 })
  }
  const usedIds = (usedRows ?? [])
    .map((r) => r.submission_id as string | null)
    .filter((id): id is string => !!id)

  let query = supabase
    .from('submissions')
    .select('id, title, artwork_url, cover_image_url, artists:primary_artist_id(name)')
    .in('type', ['release', 'single'])
    .eq('status', 'approved')
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(CANDIDATE_LIMIT)
  if (q) query = query.ilike('title', `%${q}%`)
  if (usedIds.length > 0) {
    query = query.not('id', 'in', `(${usedIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidates = ((data ?? []) as SubmissionRow[]).map((s) => {
    const a = s.artists
    const artistName = Array.isArray(a)
      ? (a[0]?.name ?? null)
      : (a?.name ?? null)
    return {
      id: s.id,
      title: s.title,
      artist_name: artistName,
      artwork_url: pickImage(s.artwork_url, s.cover_image_url),
    }
  })

  return NextResponse.json({ candidates })
}
