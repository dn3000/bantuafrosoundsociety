import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { slot_id, slot_key, submission_id, start_at, end_at } = body as {
    slot_id?: string
    slot_key?: string
    submission_id?: string
    start_at?: string
    end_at?: string | null
  }

  if (!submission_id) {
    return NextResponse.json({ error: 'submission_id required' }, { status: 400 })
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

  // Validate submission exists and is approved
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('id', submission_id)
    .single()
  if (subErr || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 422 })
  }
  if (submission.status !== 'approved') {
    return NextResponse.json(
      { error: `Submission status is '${submission.status}'; only 'approved' submissions can be scheduled` },
      { status: 422 }
    )
  }

  const newStart = (start_at as string | undefined) ?? new Date().toISOString()
  const newEnd: string | null = (end_at as string | null | undefined) ?? null

  if (newEnd !== null && new Date(newEnd) <= new Date(newStart)) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 422 })
  }

  // Overlap check: does [newStart, newEnd) overlap any existing assignment for this slot?
  // [a, b) overlaps [c, d) when: a < d AND c < b  (treating NULL as +∞)
  //   → existing.end_at IS NULL OR existing.end_at > newStart
  //   → newEnd IS NULL OR existing.start_at < newEnd
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
      submission_id,
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
