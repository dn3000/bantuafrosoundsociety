import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  resolveHeroItems,
  type HeroItemRow,
  type HeroRefType,
} from '@/lib/hero'

const ALLOWED_REF_TYPES: HeroRefType[] = ['submission', 'video', 'playlist', 'article']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('hero_items')
    .select('id, position, ref_type, ref_id, kicker, headline, is_published, created_at, updated_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data ?? []) as HeroItemRow[]
  const resolved = await resolveHeroItems(supabase, items)
  return NextResponse.json({ items: resolved })
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

  const refType = body.ref_type
  if (typeof refType !== 'string' || !ALLOWED_REF_TYPES.includes(refType as HeroRefType)) {
    return NextResponse.json({ error: 'Invalid ref_type' }, { status: 400 })
  }
  const refId = typeof body.ref_id === 'string' ? body.ref_id.trim() : ''
  if (!refId) {
    return NextResponse.json({ error: 'ref_id is required' }, { status: 400 })
  }

  // Validate the ref points at a real row of ref_type.
  const refTable: Record<HeroRefType, string> = {
    submission: 'submissions',
    video: 'videos',
    playlist: 'tracked_playlists',
    article: 'articles',
  }
  const { data: refRow, error: refErr } = await supabase
    .from(refTable[refType as HeroRefType])
    .select('id')
    .eq('id', refId)
    .maybeSingle()
  if (refErr) {
    return NextResponse.json({ error: refErr.message }, { status: 500 })
  }
  if (!refRow) {
    return NextResponse.json(
      { error: `No ${refType} with id ${refId}` },
      { status: 404 },
    )
  }

  // Append at the end: position = max + 1.
  const { data: maxRow } = await supabase
    .from('hero_items')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (maxRow?.position ?? -1) + 1

  const payload: Record<string, unknown> = {
    ref_type: refType,
    ref_id: refId,
    kicker: typeof body.kicker === 'string' ? body.kicker.trim() || null : null,
    headline: typeof body.headline === 'string' ? body.headline.trim() || null : null,
    is_published: false,
    position: nextPosition,
  }

  const { data, error } = await supabase
    .from('hero_items')
    .insert(payload)
    .select('id, position, ref_type, ref_id, kicker, headline, is_published, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const [resolved] = await resolveHeroItems(supabase, [data as HeroItemRow])
  return NextResponse.json({ item: resolved }, { status: 201 })
}
