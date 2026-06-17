import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  applySubmissionBulk,
  applyVideoBulk,
  normaliseIds,
  type ReviewAction,
} from '@/lib/admin/reviewActions'

// Unified bulk dispatcher for the review queue.
// Body: { action: 'approve'|'reject'|'defer'|'needs_work',
//         items: [{ id, source: 'submission'|'video' }], reason?: string }
//
// Partitions items by source and COMPOSES the shared reviewActions helpers
// (same code the legacy /submissions/bulk uses). Videos support approve/reject
// only — a defer/needs_work targeting a video is SKIPPED (reported, not errored).

const ALLOWED_ACTIONS: ReviewAction[] = ['approve', 'reject', 'defer', 'needs_work']
const MAX_ITEMS = 2000

type Item = { id: string; source: 'submission' | 'video' }

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action as ReviewAction
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of ${ALLOWED_ACTIONS.join(', ')}` }, { status: 400 })
  }

  const rawItems = Array.isArray(body.items) ? (body.items as unknown[]) : null
  if (!rawItems) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Too many items (max ${MAX_ITEMS})` }, { status: 400 })
  }

  // Partition by source, validating shape.
  const subIds: string[] = []
  const vidIds: string[] = []
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Partial<Item>
    if (typeof it.id !== 'string' || !it.id) continue
    if (it.source === 'submission') subIds.push(it.id)
    else if (it.source === 'video') vidIds.push(it.id)
  }

  const submissionIds = normaliseIds(subIds)
  const videoIds = normaliseIds(vidIds)

  if (submissionIds.length === 0 && videoIds.length === 0) {
    return NextResponse.json({ error: 'No valid items' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason : undefined
  const skipped: { id: string; reason: string }[] = []

  try {
    // Submissions: all four actions supported.
    const subResult = await applySubmissionBulk(supabase, submissionIds, action, user.id, reason)

    // Videos: approve/reject only. defer/needs_work → skip with a clear note.
    let vidUpdated = 0
    if (videoIds.length > 0) {
      if (action === 'approve' || action === 'reject') {
        const vidResult = await applyVideoBulk(supabase, videoIds, action)
        vidUpdated = vidResult.updated
      } else {
        for (const id of videoIds) {
          skipped.push({ id, reason: `videos do not support '${action}'` })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updated: { submissions: subResult.updated, videos: vidUpdated },
      skipped,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Bulk action failed' }, { status: 500 })
  }
}
