import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { categorizeVideo } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { supabase, error: authError } = await requireAdmin()
    if (authError) return authError

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
