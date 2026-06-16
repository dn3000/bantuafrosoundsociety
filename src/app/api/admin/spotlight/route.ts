import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SPOTLIGHT_SELECT = 'id, name, image_url, city, country, subgenres, spotlight_order'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('artists')
    .select(SPOTLIGHT_SELECT)
    .eq('is_spotlight', true)
    .order('spotlight_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
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

  const artistId = typeof body.artist_id === 'string' ? body.artist_id.trim() : ''
  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 })
  }

  // Validate the artist exists and isn't already spotlit.
  const { data: artist, error: artistErr } = await supabase
    .from('artists')
    .select('id, is_spotlight')
    .eq('id', artistId)
    .maybeSingle()
  if (artistErr) {
    return NextResponse.json({ error: artistErr.message }, { status: 500 })
  }
  if (!artist) {
    return NextResponse.json({ error: `No artist with id ${artistId}` }, { status: 404 })
  }
  if (artist.is_spotlight) {
    return NextResponse.json({ error: 'Artist is already in spotlight' }, { status: 409 })
  }

  // Append at the end: spotlight_order = max + 1.
  const { data: maxRow } = await supabase
    .from('artists')
    .select('spotlight_order')
    .eq('is_spotlight', true)
    .order('spotlight_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (maxRow?.spotlight_order ?? 0) + 1

  const { data, error } = await supabase
    .from('artists')
    .update({ is_spotlight: true, spotlight_order: nextOrder })
    .eq('id', artistId)
    .select(SPOTLIGHT_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
