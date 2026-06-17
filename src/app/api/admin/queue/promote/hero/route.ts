import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { mapRpcError } from '@/lib/admin/promoteErrors'

// Atomic "approve + promote to Hero" — submissions OR videos.
// Delegates to the SECURITY DEFINER RPC (20260617000003): flips status →
// approved AND inserts an UNPUBLISHED hero_items row in one transaction.
// Publishing remains a separate action on /admin/hero.

export async function POST(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const source = body.source
  const kicker = typeof body.kicker === 'string' ? body.kicker : null
  const headline = typeof body.headline === 'string' ? body.headline : null

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (source !== 'submission' && source !== 'video') {
    return NextResponse.json({ error: "source must be 'submission' or 'video'" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('approve_and_promote_to_hero', {
    p_id: id,
    p_type: source,
    p_kicker: kicker,
    p_headline: headline,
  })

  if (error) {
    const mapped = mapRpcError(error)
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ ok: true, result: data })
}
