import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  context: { params: Promise<{ slot_key: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slot_key } = await context.params

  const { data: slot, error: slotErr } = await supabase
    .from('editorial_slots')
    .select('id, slot_key, display_name, description, position, is_active')
    .eq('slot_key', slot_key)
    .single()

  if (slotErr || !slot) {
    return NextResponse.json({ error: `Slot '${slot_key}' not found` }, { status: 404 })
  }

  const { data: assignments, error: assignErr } = await supabase
    .from('editorial_slot_assignments')
    .select(`
      id, slot_id, submission_id, start_at, end_at, who_assigned, assigned_at, created_at,
      submissions!editorial_slot_assignments_submission_id_fkey(
        id, title, type, artwork_url, cover_image_url, status,
        artists!submissions_primary_artist_id_fkey(id, name, image_url)
      )
    `)
    .eq('slot_id', (slot as any).id)
    .order('start_at', { ascending: false })

  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })

  return NextResponse.json({ slot, assignments: assignments ?? [] })
}
