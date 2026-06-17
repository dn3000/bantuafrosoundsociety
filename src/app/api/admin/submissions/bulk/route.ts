import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { applySubmissionBulk, normaliseIds } from '@/lib/admin/reviewActions'

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
// is supplied with a reject. A reject with no reason is byte-identical to the
// single-item reject. No content columns are ever touched.
//
// The actual write lives in the shared `applySubmissionBulk` helper, which the
// unified queue dispatcher (/api/admin/queue/bulk) also uses — one source of
// truth for what an approve/reject writes.

const MAX_IDS_PER_CALL = 1000

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

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
  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  }
  const ids = normaliseIds(body.ids)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is empty' }, { status: 400 })
  }
  if (ids.length > MAX_IDS_PER_CALL) {
    return NextResponse.json(
      { error: `Too many ids in one call (max ${MAX_IDS_PER_CALL}); chunk the request` },
      { status: 400 },
    )
  }

  const reason = typeof body.reason === 'string' ? body.reason : undefined

  try {
    const { updated } = await applySubmissionBulk(supabase, ids, action, user.id, reason)
    return NextResponse.json({ updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Bulk update failed' }, { status: 500 })
  }
}
