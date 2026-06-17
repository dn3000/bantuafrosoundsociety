import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

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
