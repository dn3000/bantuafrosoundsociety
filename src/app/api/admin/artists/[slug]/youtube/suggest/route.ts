import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestChannels } from '@/lib/youtube'

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { slug } = await context.params
    const { data: artist, error } = await supabase
      .from('artists')
      .select('name')
      .eq('slug', slug)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 })

    const result = await suggestChannels(artist.name)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
