import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { slot_id, slot_key, submission_id, article_id, start_at, end_at } = body as {
    slot_id?: string
    slot_key?: string
    submission_id?: string
    article_id?: string
    start_at?: string
    end_at?: string | null
  }

  // Exactly one content reference required
  const hasSubmission = !!submission_id
  const hasArticle = !!article_id
  if (!hasSubmission && !hasArticle) {
    return NextResponse.json({ error: 'submission_id or article_id required' }, { status: 400 })
  }
  if (hasSubmission && hasArticle) {
    return NextResponse.json(
      { error: 'Provide exactly one of submission_id or article_id, not both' },
      { status: 400 }
    )
  }

  // Resolve slot_id from slot_key if needed
  let resolvedSlotId = slot_id
  if (!resolvedSlotId) {
    if (!slot_key) {
      return NextResponse.json({ error: 'slot_id or slot_key required' }, { status: 400 })
    }
    const { data: slot, error: slotErr } = await supabase
      .from('editorial_slots')
      .select('id')
      .eq('slot_key', slot_key)
      .single()
    if (slotErr || !slot) {
      return NextResponse.json({ error: `Slot '${slot_key}' not found` }, { status: 422 })
    }
    resolvedSlotId = slot.id as string
  }

  // Validate content reference
  if (hasSubmission) {
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, status')
      .eq('id', submission_id!)
      .single()
    if (subErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 422 })
    }
    if ((submission as any).status !== 'approved') {
      return NextResponse.json(
        { error: `Submission status is '${(submission as any).status}'; only 'approved' submissions can be scheduled` },
        { status: 422 }
      )
    }
  } else {
    const { data: article, error: artErr } = await supabase
      .from('articles')
      .select('id, status')
      .eq('id', article_id!)
      .single()
    if (artErr || !article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 422 })
    }
    if ((article as any).status !== 'published') {
      return NextResponse.json(
        { error: `Article status is '${(article as any).status}'; only 'published' articles can be scheduled` },
        { status: 422 }
      )
    }
  }

  const newStart = (start_at as string | undefined) ?? new Date().toISOString()
  const newEnd: string | null = (end_at as string | null | undefined) ?? null

  if (newEnd !== null && new Date(newEnd) <= new Date(newStart)) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 422 })
  }

  // Overlap check: [a, b) overlaps [c, d) when a < d AND c < b (NULL = +∞)
  let overlapQ = supabase
    .from('editorial_slot_assignments')
    .select('id, start_at, end_at')
    .eq('slot_id', resolvedSlotId)
    .or(`end_at.is.null,end_at.gt.${newStart}`)

  if (newEnd !== null) {
    overlapQ = overlapQ.lt('start_at', newEnd)
  }

  const { data: conflicts, error: overlapErr } = await overlapQ.limit(1)
  if (overlapErr) {
    return NextResponse.json({ error: overlapErr.message }, { status: 500 })
  }
  if (conflicts && conflicts.length > 0) {
    const c = conflicts[0]
    return NextResponse.json(
      {
        error: 'Window overlaps an existing assignment for this slot',
        conflict: { id: c.id, start_at: c.start_at, end_at: c.end_at },
      },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('editorial_slot_assignments')
    .insert({
      slot_id: resolvedSlotId,
      submission_id: hasSubmission ? submission_id! : null,
      article_id: hasArticle ? article_id! : null,
      start_at: newStart,
      end_at: newEnd,
      who_assigned: user.id,
      assigned_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: data }, { status: 201 })
}
