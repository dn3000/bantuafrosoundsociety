import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { categorizeVideo } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: adminCheck } = await supabase.rpc('is_admin')
    if (!adminCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: videos, error: fetchErr } = await supabase
      .from('videos')
      .select('id, title, category')
      .eq('status', 'pending')
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const rows = videos ?? []
    let changed = 0
    const byCategory: Record<string, number> = {
      mix: 0,
      live_set: 0,
      music_video: 0,
      interview: 0,
      other: 0,
    }

    for (const video of rows) {
      const newCategory = categorizeVideo((video.title as string) || '')
      byCategory[newCategory] = (byCategory[newCategory] ?? 0) + 1
      if (newCategory !== video.category) {
        const { error: upErr } = await supabase
          .from('videos')
          .update({ category: newCategory })
          .eq('id', video.id)
        if (!upErr) changed++
      }
    }

    return NextResponse.json({ scanned: rows.length, changed, byCategory })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
