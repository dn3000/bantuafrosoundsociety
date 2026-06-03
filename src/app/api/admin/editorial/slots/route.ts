import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()

  const [slotsRes, liveRes, assignmentsRes] = await Promise.all([
    supabase
      .from('editorial_slots')
      .select('id, slot_key, display_name, description, position, is_active')
      .order('position', { ascending: true }),
    supabase
      .from('v_editorial_live')
      .select('slot_id, assignment_id, submission_id, start_at, end_at'),
    supabase
      .from('editorial_slot_assignments')
      .select('slot_id, start_at, end_at'),
  ])

  if (slotsRes.error) return NextResponse.json({ error: slotsRes.error.message }, { status: 500 })

  // Fetch submission details for live items
  const liveSubIds = (liveRes.data ?? []).map((r) => (r as any).submission_id).filter(Boolean) as string[]
  const subMap: Record<string, {
    title: string
    artwork_url: string | null
    cover_image_url: string | null
    artists: { name: string; image_url: string | null } | null
  }> = {}
  if (liveSubIds.length > 0) {
    const { data: subs } = await supabase
      .from('submissions')
      .select('id, title, artwork_url, cover_image_url, artists!submissions_primary_artist_id_fkey(name, image_url)')
      .in('id', liveSubIds)
    for (const s of subs ?? []) {
      subMap[(s as any).id] = s as unknown as typeof subMap[string]
    }
  }

  // Per-slot upcoming / past counts (live assignments counted separately)
  const counts: Record<string, { upcoming: number; past: number }> = {}
  for (const a of assignmentsRes.data ?? []) {
    const slotId = (a as any).slot_id as string
    if (!counts[slotId]) counts[slotId] = { upcoming: 0, past: 0 }
    const startAt = (a as any).start_at as string
    const endAt = (a as any).end_at as string | null
    if (startAt > now) counts[slotId].upcoming++
    else if (endAt !== null && endAt <= now) counts[slotId].past++
  }

  // Map live rows by slot_id
  const liveBySlot: Record<string, object> = {}
  for (const row of liveRes.data ?? []) {
    const r = row as any
    const sub = subMap[r.submission_id]
    const artist = Array.isArray(sub?.artists) ? sub.artists[0] : sub?.artists
    liveBySlot[r.slot_id] = {
      assignment_id: r.assignment_id,
      submission_id: r.submission_id,
      start_at: r.start_at,
      end_at: r.end_at,
      title: sub?.title ?? null,
      artwork_url: sub?.artwork_url ?? null,
      cover_image_url: sub?.cover_image_url ?? null,
      artist_name: artist?.name ?? null,
      artist_image_url: artist?.image_url ?? null,
    }
  }

  const slots = (slotsRes.data ?? []).map((slot) => ({
    ...(slot as any),
    live: liveBySlot[(slot as any).id] ?? null,
    upcoming_count: counts[(slot as any).id]?.upcoming ?? 0,
    past_count: counts[(slot as any).id]?.past ?? 0,
  }))

  return NextResponse.json({
    slots,
    live_count: Object.keys(liveBySlot).length,
  })
}
