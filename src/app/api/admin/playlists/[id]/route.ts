import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Toggle is_active on a tracked playlist. Admin-gated by is_admin() RLS: a
// non-admin's UPDATE matches zero rows (USING is_admin()), so `data` is null and
// we 404 — blocked at the RLS layer, no user_roles read.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active (boolean) is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tracked_playlists')
    .update({ is_active: body.is_active })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ playlist: data })
}

// Remove a tracked playlist. Admin-gated by is_admin() RLS.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { error } = await supabase.from('tracked_playlists').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
