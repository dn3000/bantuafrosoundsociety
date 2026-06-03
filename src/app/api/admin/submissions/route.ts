import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['track', 'release', 'mix', 'event'] as const
const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'deferred', 'needs_work'] as const
const ALLOWED_PRIORITIES = ['low', 'normal', 'high'] as const

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const typeFilter = searchParams.get('type') || ''
  const search = searchParams.get('search')?.trim() || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10), MAX_LIMIT)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  // Note: joining primary_artist_id → artists relation
  let query = supabase
    .from('submissions')
    .select('*, artists!submissions_primary_artist_id_fkey(id, name, slug, image_url)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status && (ALLOWED_STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status)
  }
  if (typeFilter && (ALLOWED_TYPES as readonly string[]).includes(typeFilter)) {
    query = query.eq('type', typeFilter)
  }
  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    submissions: data,
    total: count ?? 0,
    limit,
    offset,
  })
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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const primaryArtistId = typeof body.artist_id === 'string' ? body.artist_id : null
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const type = typeof body.submission_type === 'string' ? body.submission_type : 'track'
  const sourceUrl = typeof body.url === 'string' ? body.url.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const coverImageUrl = typeof body.cover_image_url === 'string' ? body.cover_image_url.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

  if (!primaryArtistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid submission_type' }, { status: 400 })
  }

  // source_url is required by schema; if user didn't provide URL, store a placeholder
  // (we can refine this later — the schema requires it but our manual form makes it optional)
  const effectiveSourceUrl = sourceUrl || `manual:${Date.now()}`

  const insertPayload: Record<string, unknown> = {
    type,
    source: 'other',
    source_url: effectiveSourceUrl,
    title,
    primary_artist_id: primaryArtistId,
    submitted_by: user.id,
    description: description || null,
    cover_image_url: coverImageUrl || null,
    notes: notes || null,
    source_method: 'manual',
    status: 'pending',
    priority: 'normal',
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert(insertPayload)
    .select('*, artists!submissions_primary_artist_id_fkey(id, name, slug, image_url)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submission: data })
}
