import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() || ''
  const tier = searchParams.get('tier') || ''
  const tracked = searchParams.get('tracked') || ''
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
  const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

  let query = supabase
    .from('artists')
    .select('id, name, slug, tier, status, is_tracked, country, city, subgenres, image_url, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  if (tier === 'featured' || tier === 'active' || tier === 'watch') {
    query = query.eq('tier', tier)
  }
  if (tracked === 'true') {
    query = query.eq('is_tracked', true)
  } else if (tracked === 'false') {
    query = query.eq('is_tracked', false)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artists: data ?? [], total: count ?? 0, limit, offset })
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

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const baseSlug = slugify(name)
  const suffix = Math.random().toString(36).slice(2, 6)
  const slug = baseSlug ? `${baseSlug}-${suffix}` : `artist-${suffix}`

  const allowedTiers = ['featured', 'active', 'watch']
  const allowedStatuses = ['active', 'inactive', 'hiatus']

  const insertPayload: Record<string, unknown> = {
    name,
    slug,
    tier: allowedTiers.includes(body.tier as string) ? body.tier : 'active',
    status: allowedStatuses.includes(body.status as string) ? body.status : 'active',
    is_tracked: body.is_tracked === true,
    country: typeof body.country === 'string' ? body.country.trim() || null : null,
    city: typeof body.city === 'string' ? body.city.trim() || null : null,
    subgenres: Array.isArray(body.subgenres) ? body.subgenres.filter((s) => typeof s === 'string') : [],
    bio: typeof body.bio === 'string' ? body.bio.trim() || null : null,
    added_by: user.id,
  }

  const { data, error } = await supabase
    .from('artists')
    .insert(insertPayload)
    .select('id, slug, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artist: data }, { status: 201 })
}
