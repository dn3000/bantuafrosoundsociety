import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { suggestChannels } from '@/lib/youtube'

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

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
