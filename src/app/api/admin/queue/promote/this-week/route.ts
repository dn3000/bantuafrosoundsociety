import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { mapRpcError } from '@/lib/admin/promoteErrors'

// Atomic "approve + promote to This Week" — submissions only.
// Delegates to the SECURITY DEFINER RPC (20260617000003) so the status flip and
// the bass_this_week insert happen in one transaction.

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // This Week is submissions-only (bass_this_week.submission_id). A video here
  // is a 400, by contract.
  if (body.source && body.source !== 'submission') {
    return NextResponse.json(
      { error: 'This Week promotion supports submissions only' },
      { status: 400 },
    )
  }

  const submissionId = typeof body.submission_id === 'string' ? body.submission_id.trim() : ''
  if (!submissionId) {
    return NextResponse.json({ error: 'submission_id required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('approve_and_promote_to_this_week', {
    p_submission_id: submissionId,
  })

  if (error) {
    const mapped = mapRpcError(error)
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ ok: true, result: data })
}
