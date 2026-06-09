import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// List tracked playlists for the admin manage page. Reads are public (RLS
// USING true); we still require an authenticated session for the admin surface.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('tracked_playlists')
    .select('id, spotify_playlist_id, name, description, image_url, owner_name, is_active, last_scanned_at, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ playlists: data ?? [] })
}
