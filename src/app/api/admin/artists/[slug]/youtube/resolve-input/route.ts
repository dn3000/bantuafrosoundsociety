import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { resolveChannelByInput } from '@/lib/youtube'

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

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
