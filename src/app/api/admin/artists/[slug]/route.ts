import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TIERS = ['featured', 'active', 'watch']
const ALLOWED_STATUSES = ['active', 'inactive', 'hiatus']
const ALLOWED_RELATIONSHIP_STATUSES = ['cold', 'warm', 'friend', 'collaborator']

const EDITABLE_FIELDS = [
  'name', 'tier', 'status', 'is_tracked',
  'country', 'city', 'bio', 'subgenres',
  'relationship_status',
  'website_url', 'instagram_handle', 'twitter_handle', 'tiktok_handle', 'facebook_url',
  'bandcamp_url', 'soundcloud_url', 'discogs_url', 'wikipedia_url', 'youtube_url',
  'spotify_artist_id', 'musicbrainz_artist_id',
  'youtube_channel_id', 'youtube_topic_channel_id',
  'private_notes',
  'last_release_date', 'last_contact_date',
] as const

type EditableField = (typeof EDITABLE_FIELDS)[number]

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await context.params
  const { data: artist, error } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }

  return NextResponse.json({ artist })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Sanitize: only allowed fields
  const updates: Partial<Record<EditableField, unknown>> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  // Validate constrained values
  if ('tier' in updates && !ALLOWED_TIERS.includes(updates.tier as string)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }
  if ('status' in updates && !ALLOWED_STATUSES.includes(updates.status as string)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if ('relationship_status' in updates && updates.relationship_status !== null &&
      !ALLOWED_RELATIONSHIP_STATUSES.includes(updates.relationship_status as string)) {
    return NextResponse.json({ error: 'Invalid relationship_status' }, { status: 400 })
  }

  // Coerce empty strings to NULL (so we don't accidentally store empty values)
  for (const key of Object.keys(updates)) {
    if (updates[key as EditableField] === '') {
      updates[key as EditableField] = null
    }
  }

  // Parse subgenres if it came in as a comma-separated string
  if (typeof updates.subgenres === 'string') {
    updates.subgenres = (updates.subgenres as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('slug', slug)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artist: data })
}
