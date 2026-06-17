import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { resolveHeroItems, type HeroItemRow } from '@/lib/hero'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('kicker' in body) {
    updates.kicker = typeof body.kicker === 'string' ? body.kicker.trim() || null : null
  }
  if ('headline' in body) {
    updates.headline = typeof body.headline === 'string' ? body.headline.trim() || null : null
  }
  if ('is_published' in body) {
    if (typeof body.is_published !== 'boolean') {
      return NextResponse.json({ error: 'is_published must be a boolean' }, { status: 400 })
    }
    updates.is_published = body.is_published
  }
  if ('position' in body) {
    if (typeof body.position !== 'number' || !Number.isInteger(body.position)) {
      return NextResponse.json({ error: 'position must be an integer' }, { status: 400 })
    }
    updates.position = body.position
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('hero_items')
    .update(updates)
    .eq('id', id)
    .select('id, position, ref_type, ref_id, kicker, headline, is_published, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  const [resolved] = await resolveHeroItems(supabase, [data as HeroItemRow])
  return NextResponse.json({ item: resolved })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  const { error } = await supabase.from('hero_items').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
