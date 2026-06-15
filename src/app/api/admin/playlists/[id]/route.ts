import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const COLUMNS =
  'id, spotify_playlist_id, name, curator_name, description, cover_image_url, image_url, owner_name, is_published, is_bass_made, display_order, track_count, is_active, last_scanned_at, created_at, updated_at'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string') patch.name = body.name.trim() || null
  if (typeof body.curatorName === 'string') patch.curator_name = body.curatorName.trim() || null
  if (typeof body.description === 'string') patch.description = body.description.trim() || null
  if (typeof body.coverImageUrl === 'string')
    patch.cover_image_url = body.coverImageUrl.trim() || null
  if (typeof body.isPublished === 'boolean') patch.is_published = body.isPublished
  if (typeof body.isBassMade === 'boolean') patch.is_bass_made = body.isBassMade
  if (typeof body.displayOrder === 'number') patch.display_order = body.displayOrder
  if (typeof body.trackCount === 'number') patch.track_count = body.trackCount
  // Legacy scraper field kept for backward compat with the scrapers admin surface.
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active

  const { data, error } = await supabase
    .from('tracked_playlists')
    .update(patch)
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ playlist: data })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const { error } = await supabase.from('tracked_playlists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
