import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { submission_id, article_id, start_at, end_at } = body as {
    submission_id?: string
    article_id?: string
    start_at?: string
    end_at?: string | null
  }

  if (submission_id === undefined && article_id === undefined && start_at === undefined && end_at === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  if (submission_id !== undefined && article_id !== undefined) {
    return NextResponse.json({ error: 'Provide at most one of submission_id or article_id' }, { status: 400 })
  }

  // Fetch current assignment to fill in unchanged fields for validation
  const { data: current, error: fetchErr } = await supabase
    .from('editorial_slot_assignments')
    .select('id, slot_id, submission_id, article_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Validate new submission if changing
  if (submission_id !== undefined) {
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, status')
      .eq('id', submission_id)
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
  }

  // Validate new article if changing
  if (article_id !== undefined) {
    const { data: article, error: artErr } = await supabase
      .from('articles')
      .select('id, status')
      .eq('id', article_id)
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

  const newStart: string = (start_at as string | undefined) ?? (current.start_at as string)
  const newEnd: string | null = end_at !== undefined
    ? ((end_at as string | null) ?? null)
    : (current.end_at as string | null)

  if (newEnd !== null && new Date(newEnd) <= new Date(newStart)) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 422 })
  }

  // Overlap check excluding this row
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

  // Resolve content reference for update
  let resolvedSubmissionId: string | null
  let resolvedArticleId: string | null
  if (submission_id !== undefined) {
    resolvedSubmissionId = submission_id
    resolvedArticleId = null
  } else if (article_id !== undefined) {
    resolvedSubmissionId = null
    resolvedArticleId = article_id
  } else {
    resolvedSubmissionId = current.submission_id as string | null
    resolvedArticleId = (current as any).article_id as string | null
  }

  const updates: Record<string, unknown> = {
    submission_id: resolvedSubmissionId,
    article_id: resolvedArticleId,
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
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await context.params
  const { error } = await supabase
    .from('editorial_slot_assignments')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
