import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveChannelByInput } from '@/lib/youtube'

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Route is scoped to [slug] for consistency but resolution is artist-agnostic
  await context.params

  try {
    let body: { input?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (typeof body.input !== 'string' || !body.input.trim()) {
      return NextResponse.json({ error: 'input required' }, { status: 400 })
    }

    const result = await resolveChannelByInput(body.input)
    if (!result) return NextResponse.json({ error: 'Could not resolve channel' }, { status: 404 })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
