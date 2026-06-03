import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { submission_id, start_at, end_at } = body as {
    submission_id?: string
    start_at?: string
    end_at?: string | null
  }

  if (submission_id === undefined && start_at === undefined && end_at === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Fetch current assignment to fill in unchanged fields for validation
  const { data: current, error: fetchErr } = await supabase
    .from('editorial_slot_assignments')
    .select('id, slot_id, submission_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Validate new submission if changing
  const resolvedSubmissionId = submission_id ?? (current.submission_id as string)
  if (submission_id !== undefined) {
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
  }

  const newStart: string = (start_at as string | undefined) ?? (current.start_at as string)
  const newEnd: string | null = end_at !== undefined ? ((end_at as string | null) ?? null) : (current.end_at as string | null)

  if (newEnd !== null && new Date(newEnd) <= new Date(newStart)) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 422 })
  }

  // Overlap check excluding this row
  // [a, b) overlaps [c, d) when: a < d AND c < b  (treating NULL as +∞)
  let overlapQ = supabase
    .from('editorial_slot_assignments')
    .select('id, start_at, end_at')
    .eq('slot_id', current.slot_id as string)
    .neq('id', id)
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
        error: 'Updated window overlaps an existing assignment for this slot',
        conflict: { id: c.id, start_at: c.start_at, end_at: c.end_at },
      },
      { status: 409 }
    )
  }

  const updates: Record<string, unknown> = {
    submission_id: resolvedSubmissionId,
    start_at: newStart,
    end_at: newEnd,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('editorial_slot_assignments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignment: data })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const { error } = await supabase
    .from('editorial_slot_assignments')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
