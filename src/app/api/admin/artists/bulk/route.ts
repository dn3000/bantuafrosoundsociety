import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// Bulk set is_tracked on artists (add/remove from the scraper whitelist).
//
// Authorization mirrors every other artist write (POST /api/admin/artists,
// PATCH /api/admin/artists/[slug]) and the bulk-submissions endpoint exactly:
// authenticate the request, then let the database enforce admin via the
// is_admin() RLS policy on `artists` ("Admins can manage artists" FOR ALL
// USING/WITH CHECK is_admin()). The UPDATE runs under this same user-session
// client, so a non-admin matches zero rows ({ updated: 0 }) and writes nothing.
//
// Do NOT reintroduce a direct user_roles read to check admin here: is_admin()
// is SECURITY DEFINER precisely so it can see user_roles, but the
// `authenticated` role has no SELECT grant on that table — a direct read errors
// and 403s even a real admin. That bespoke check was the cause of the
// bulk-submissions 403; this endpoint must not repeat it.

// DB UPDATEs run in batches of this size; a single request may carry up to MAX_IDS.
const CHUNK_SIZE = 200
const MAX_IDS = 5000

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action
  if (action !== 'track' && action !== 'untrack') {
    return NextResponse.json({ error: "action must be 'track' or 'untrack'" }, { status: 400 })
  }

  // Validate + normalise ids: strings only, de-duplicated, non-empty.
  const rawIds = Array.isArray(body.ids) ? body.ids : null
  if (!rawIds) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  }
  const ids = Array.from(new Set(rawIds.filter((v): v is string => typeof v === 'string' && v.length > 0)))
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is empty' }, { status: 400 })
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids in one call (max ${MAX_IDS}); chunk the request` },
      { status: 400 },
    )
  }

  const isTracked = action === 'track'

  // Chunk the UPDATE into batches of <= CHUNK_SIZE ids. Every batch is gated by
  // the same is_admin() RLS policy, so a non-admin updates zero rows across all
  // batches. We sum the returned row ids for an accurate { updated } count.
  let updated = 0
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const batch = ids.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from('artists')
      .update({ is_tracked: isTracked })
      .in('id', batch)
      .select('id')
    if (error) {
      // Surface what succeeded so the caller can resume the remainder.
      return NextResponse.json({ error: error.message, updated }, { status: 500 })
    }
    updated += data?.length ?? 0
  }

  return NextResponse.json({ updated })
}
