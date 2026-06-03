import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() || ''

  if (!q) {
    return NextResponse.json({ artists: [] })
  }

  const { data, error } = await supabase
    .from('artists')
    .select('id, name, slug, image_url, tier, country, city')
    .ilike('name', `%${q}%`)
    .order('tier', { ascending: true })
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ artists: data || [] })
}
