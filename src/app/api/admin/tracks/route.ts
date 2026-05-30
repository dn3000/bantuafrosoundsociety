import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80)
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
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const baseSlug = slugify(title)
  const suffix = Math.random().toString(36).slice(2, 6)
  const slug = baseSlug ? `${baseSlug}-${suffix}` : `track-${suffix}`

  const insertPayload: Record<string, unknown> = {
    title,
    slug,
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    bpm: typeof body.bpm === 'number' && Number.isFinite(body.bpm) ? Math.round(body.bpm) : null,
    key: typeof body.key === 'string' ? body.key.trim() || null : null,
    energy: typeof body.energy === 'number' && body.energy >= 1 && body.energy <= 10 ? Math.round(body.energy) : null,
    subgenres: Array.isArray(body.subgenres) ? body.subgenres.filter((s) => typeof s === 'string') : [],
    mood_tags: Array.isArray(body.mood_tags) ? body.mood_tags.filter((s) => typeof s === 'string') : [],
    vocal_type: typeof body.vocal_type === 'string' ? body.vocal_type.trim() || null : null,
    release_date: typeof body.release_date === 'string' && body.release_date ? body.release_date : null,
    artwork_url: typeof body.artwork_url === 'string' ? body.artwork_url.trim() || null : null,
    preview_url: typeof body.preview_url === 'string' ? body.preview_url.trim() || null : null,
    preview_source: typeof body.preview_source === 'string' ? body.preview_source.trim() || null : null,
    platform_links: typeof body.platform_links === 'object' && body.platform_links !== null ? body.platform_links : {},
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    is_published: body.is_published === true,
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tracks')
    .insert(insertPayload)
    .select('id, slug, title')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ track: data }, { status: 201 })
}
