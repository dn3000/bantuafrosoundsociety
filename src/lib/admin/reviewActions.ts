// =========================================
// Shared review-action helpers (server-only).
// =========================================
// One implementation of "write a review verdict to N rows", used by BOTH the
// legacy POST /api/admin/submissions/bulk and the new POST /api/admin/queue/bulk
// dispatcher. Keeps field parity in one place so the two surfaces can never
// drift on what an approve/reject actually writes.
//
// Grounded in schema:
//   submissions: status + approved_by + approved_at on every status change
//     (mirrors PATCH /submissions/[id]); rejection_reason only on reject.
//   videos: status only — the table has NO approved_by/approved_at columns
//     (20260610000002). Videos support approve/reject only.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ReviewAction = 'approve' | 'reject' | 'defer' | 'needs_work'
export type VideoReviewAction = 'approve' | 'reject'

const ACTION_TO_STATUS: Record<ReviewAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  defer: 'deferred',
  needs_work: 'needs_work',
}

// PostgREST .in(...) filters live in the URL; keep each call small. The submissions
// review queue has always chunked at 200 (page.tsx CHUNK_SIZE).
export const BULK_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Dedupe + drop empties/non-strings. Mirrors the legacy bulk route's normalisation. */
export function normaliseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0)))
}

/**
 * Apply a review verdict to a set of submissions. Writes exactly
 * { status, approved_by, approved_at } (+ rejection_reason on a reject with a
 * non-empty reason) — byte-identical to the single-item PATCH and the legacy
 * bulk route. Chunks internally; returns the number of rows updated.
 */
export async function applySubmissionBulk(
  supabase: SupabaseClient,
  ids: string[],
  action: ReviewAction,
  userId: string,
  reason?: string,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 }

  const updates: Record<string, unknown> = {
    status: ACTION_TO_STATUS[action],
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }
  if (action === 'reject' && typeof reason === 'string') {
    const trimmed = reason.trim()
    if (trimmed) updates.rejection_reason = trimmed
  }

  let updated = 0
  for (const part of chunk(ids, BULK_CHUNK)) {
    const { data, error } = await supabase
      .from('submissions')
      .update(updates)
      .in('id', part)
      .select('id')
    if (error) throw new Error(error.message)
    updated += data?.length ?? 0
  }
  return { updated }
}

/**
 * Apply a review verdict to a set of videos. Videos support approve/reject only
 * and the table has no audit columns, so only `status` is written. Chunks
 * internally; returns the number of rows updated.
 */
export async function applyVideoBulk(
  supabase: SupabaseClient,
  ids: string[],
  action: VideoReviewAction,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 }

  const status = action === 'approve' ? 'approved' : 'rejected'

  let updated = 0
  for (const part of chunk(ids, BULK_CHUNK)) {
    const { data, error } = await supabase
      .from('videos')
      .update({ status })
      .in('id', part)
      .select('id')
    if (error) throw new Error(error.message)
    updated += data?.length ?? 0
  }
  return { updated }
}
