import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { mergeArtistPrivate, splitArtistUpdates } from '@/lib/artistPii'

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
] as const

type EditableField = (typeof EDITABLE_FIELDS)[number]

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

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

  // PII now lives in artists_private — fetch and merge so callers get the same
  // flat artist shape they did before the split.
  const { data: priv, error: privError } = await supabase
    .from('artists_private')
    .select('*')
    .eq('artist_id', artist.id)
    .maybeSingle()
  if (privError) {
    return NextResponse.json({ error: privError.message }, { status: 500 })
  }

  return NextResponse.json({ artist: mergeArtistPrivate(artist, priv) })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

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

  // Route each field to its table: public columns stay on artists, PII goes to
  // artists_private.
  const { publicUpdates, privateUpdates } = splitArtistUpdates(updates)

  // Resolve the artist row (and its id). When there are public columns to
  // change, do that update and reuse the returned row; otherwise just look the
  // artist up so we can target its private row.
  let artistRow: Record<string, unknown> | null
  if (Object.keys(publicUpdates).length > 0) {
    const { data, error } = await supabase
      .from('artists')
      .update(publicUpdates)
      .eq('slug', slug)
      .select('*')
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    artistRow = data
  } else {
    const { data, error } = await supabase
      .from('artists')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    artistRow = data
  }

  if (!artistRow) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }
  const artistId = artistRow.id as string

  // Upsert PII into the sister table. If this fails the public columns may
  // already be written, so report a partial update rather than a clean error.
  let privateRow: Record<string, unknown> | null = null
  if (Object.keys(privateUpdates).length > 0) {
    const { data, error } = await supabase
      .from('artists_private')
      .upsert({ artist_id: artistId, ...privateUpdates }, { onConflict: 'artist_id' })
      .select('*')
      .maybeSingle()
    if (error) {
      return NextResponse.json(
        {
          error: `Public fields saved, but private fields failed: ${error.message}`,
          partial: true,
        },
        { status: 500 },
      )
    }
    privateRow = data
  } else {
    const { data } = await supabase
      .from('artists_private')
      .select('*')
      .eq('artist_id', artistId)
      .maybeSingle()
    privateRow = data ?? null
  }

  return NextResponse.json({ artist: mergeArtistPrivate(artistRow, privateRow) })
}
