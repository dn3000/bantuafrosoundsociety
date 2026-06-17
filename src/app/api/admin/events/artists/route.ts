import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SEARCH_LIMIT = 30

// Lookup used by the events admin lineup picker. Searches roster artists by
// name; supports prefetching a specific set via ?ids=uuid,uuid so the edit
// form can hydrate the chips of an already-saved lineup.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const idsParam = (searchParams.get('ids') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()

  if (idsParam) {
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    if (ids.length === 0) {
      return NextResponse.json({ artists: [] })
    }
    const { data, error } = await supabase
      .from('artists')
      .select('id, slug, name, image_url')
      .in('id', ids)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ artists: data ?? [] })
  }

  let query = supabase
    .from('artists')
    .select('id, slug, name, image_url')
    .order('name', { ascending: true })
    .limit(SEARCH_LIMIT)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artists: data ?? [] })
}
