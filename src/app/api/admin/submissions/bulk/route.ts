import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Bulk approve/reject for the submissions review queue.
//
// Field parity is the whole point of this endpoint: it must write EXACTLY the
// same audit fields, the same way, as the single-item flow in
// `PATCH /api/admin/submissions/[id]`. That handler, whenever `status` changes,
// sets: status, approved_by = current user, approved_at = now() — and nothing
// else. So:
//   approve -> { status: 'approved', approved_by, approved_at }
//   reject  -> { status: 'rejected', approved_by, approved_at }
// Approving "publishes" purely by virtue of status='approved' (the public-read
// RLS policy exposes WHERE status='approved'); single-approve does NOT touch
// published_at, so neither do we.
//
// The only addition is `rejection_reason`, written ONLY when a non-empty reason
// is supplied with a reject. It is an audit field describing the verdict (not a
// content column), and the bulk UI explicitly collects it. A reject with no
// reason is byte-identical to the single-item reject. No content columns
// (title, artwork_url, primary_artist_id, release_date, source, …) are ever
// touched.

const MAX_IDS_PER_CALL = 1000

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin-only. Writes are already gated by the is_admin() RLS policy on
  // submissions (a non-admin would simply match zero rows), but we check
  // explicitly so non-admins get a clear 403 instead of a silent { updated: 0 }.
  // The "Users can read their own roles" policy permits this self-read.
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)
  if (!roleRows || roleRows.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
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
  if (ids.length > MAX_IDS_PER_CALL) {
    return NextResponse.json(
      { error: `Too many ids in one call (max ${MAX_IDS_PER_CALL}); chunk the request` },
      { status: 400 },
    )
  }

  // Mirror the single-item PATCH exactly.
  const updates: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  }

  // Optional rejection reason — additive, reject-only, never on approve.
  if (action === 'reject' && typeof body.reason === 'string') {
    const reason = body.reason.trim()
    if (reason) updates.rejection_reason = reason
  }

  const { data, error } = await supabase
    .from('submissions')
    .update(updates)
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length ?? 0 })
}
