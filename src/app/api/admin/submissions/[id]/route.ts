import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'deferred', 'needs_work']
const ALLOWED_PRIORITIES = ['low', 'normal', 'high']

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { data, error } = await supabase
    .from('submissions')
    .select('*, artists(id, name, slug, image_url)')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ submission: data })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
    updates.reviewed_by = user.id
    updates.reviewed_at = new Date().toISOString()
  }

  if (typeof body.priority === 'string') {
    if (!ALLOWED_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }
    updates.priority = body.priority
  }

  const stringFields = ['title', 'url', 'description', 'cover_image_url', 'notes'] as const
  for (const field of stringFields) {
    if (typeof body[field] === 'string') {
      const v = (body[field] as string).trim()
      updates[field] = v || null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('submissions')
    .update(updates)
    .eq('id', id)
    .select('*, artists(id, name, slug, image_url)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ submission: data })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { error } = await supabase.from('submissions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
