import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const ALLOWED_STATUSES = ['draft', 'published', 'archived'] as const
const ALLOWED_KINDS = ['original', 'link'] as const

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return NextResponse.json({ article: data })
}

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

  if ('kind' in body) {
    if (!ALLOWED_KINDS.includes(body.kind as (typeof ALLOWED_KINDS)[number])) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
    updates.kind = body.kind
  }

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    updates.title = title
  }

  if ('slug' in body) updates.slug = body.slug
  if ('dek' in body) updates.dek = body.dek
  if ('body' in body) updates.body = body.body
  if ('excerpt' in body) updates.excerpt = body.excerpt
  if ('commentary' in body) updates.commentary = body.commentary
  if ('source_url' in body) updates.source_url = body.source_url
  if ('source_name' in body) updates.source_name = body.source_name
  if ('cover_image_url' in body) updates.cover_image_url = body.cover_image_url
  if ('author' in body) updates.author = body.author
  if ('tags' in body) updates.tags = Array.isArray(body.tags) ? body.tags : []

  if ('status' in body) {
    if (!ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
    // Set published_at if transitioning to published and it isn't already set
    if (body.status === 'published') {
      const { data: current } = await supabase
        .from('articles')
        .select('published_at')
        .eq('id', id)
        .single()
      if (!current?.published_at) {
        updates.published_at = new Date().toISOString()
      }
    }
  }

  if ('published_at' in body) updates.published_at = body.published_at

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('articles')
    .update(updates)
    .eq('id', id)
    .select('id, slug, title, status, published_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Slug is already taken. Choose a different slug.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ article: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  const { error } = await supabase.from('articles').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
