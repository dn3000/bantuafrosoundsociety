import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { getChannelsByIds } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  let body: { channelIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.channelIds)) {
    return NextResponse.json({ error: 'channelIds must be an array' }, { status: 400 })
  }

  const ids = (body.channelIds as unknown[]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  if (ids.length === 0) return NextResponse.json({ titles: {} })
  if (ids.length > 500) {
    return NextResponse.json({ error: 'Too many IDs (max 500)' }, { status: 400 })
  }

  const results = await getChannelsByIds(ids)
  const titles: Record<string, string> = {}
  for (const r of results) titles[r.id] = r.title

  return NextResponse.json({ titles })
}
