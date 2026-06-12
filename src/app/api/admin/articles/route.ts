import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/slugify'

const ALLOWED_STATUSES = ['draft', 'published', 'archived'] as const
const ALLOWED_KINDS = ['original', 'link'] as const

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status') ?? ''
  const searchFilter = searchParams.get('search') ?? ''

  let query = supabase
    .from('articles')
    .select('id, kind, title, slug, dek, author, tags, status, published_at, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (ALLOWED_STATUSES.includes(statusFilter as (typeof ALLOWED_STATUSES)[number])) {
    query = query.eq('status', statusFilter)
  }

  if (searchFilter) {
    query = query.ilike('title', `%${searchFilter}%`)
  }

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ articles: data ?? [], total: count ?? 0 })
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

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const rawSlug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const slug = rawSlug || slugify(title)
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a slug from the title' }, { status: 400 })
  }

  const kind = ALLOWED_KINDS.includes(body.kind as (typeof ALLOWED_KINDS)[number])
    ? (body.kind as string)
    : 'original'

  const status = ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])
    ? (body.status as string)
    : 'draft'

  const publishedAt =
    status === 'published' && !body.published_at ? new Date().toISOString() : (body.published_at ?? null)

  const payload: Record<string, unknown> = {
    kind,
    title,
    slug,
    dek: typeof body.dek === 'string' ? body.dek.trim() || null : null,
    body: typeof body.body === 'string' ? body.body.trim() || null : null,
    excerpt: typeof body.excerpt === 'string' ? body.excerpt.trim() || null : null,
    commentary: typeof body.commentary === 'string' ? body.commentary.trim() || null : null,
    source_url: typeof body.source_url === 'string' ? body.source_url.trim() || null : null,
    source_name: typeof body.source_name === 'string' ? body.source_name.trim() || null : null,
    cover_image_url: typeof body.cover_image_url === 'string' ? body.cover_image_url.trim() || null : null,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'BASS',
    tags: Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t) => typeof t === 'string') : [],
    status,
    published_at: publishedAt,
  }

  const { data, error } = await supabase
    .from('articles')
    .insert(payload)
    .select('id, slug, title, status')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Slug "${slug}" is already taken. Choose a different slug.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ article: data }, { status: 201 })
}
