import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const CANDIDATE_LIMIT = 50

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  let query = supabase
    .from('artists')
    .select('id, name, image_url, city, country, subgenres')
    .eq('is_spotlight', false)
    .order('name', { ascending: true })
    .limit(CANDIDATE_LIMIT)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ candidates: data ?? [] })
}
