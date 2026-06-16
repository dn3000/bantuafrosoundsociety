import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SPOTLIGHT_SELECT = 'id, name, image_url, city, country, subgenres, spotlight_order'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if ('spotlight_order' in body) {
    if (typeof body.spotlight_order !== 'number' || !Number.isInteger(body.spotlight_order)) {
      return NextResponse.json({ error: 'spotlight_order must be an integer' }, { status: 400 })
    }
    updates.spotlight_order = body.spotlight_order
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .eq('is_spotlight', true)
    .select(SPOTLIGHT_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const { error } = await supabase
    .from('artists')
    .update({ is_spotlight: false, spotlight_order: null })
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
