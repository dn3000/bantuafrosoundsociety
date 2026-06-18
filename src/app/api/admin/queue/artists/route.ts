import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// Artist quick-search for the review-queue "Filter by artist" combo box in
// QueueClient. Modeled on the events lineup-picker lookup
// (api/admin/events/artists): same lean projection and name ordering, but it
// also matches on slug and honours a caller-supplied `limit`.
//
// Deliberately separate from api/admin/artists/search — that route is consumed
// by /admin/submissions/new, which renders tier/city/country and relies on its
// tier ordering, so it can't be narrowed to this shape without breaking that
// page. Keeping the queue's lookup here lets it stay lean and predictable.
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  )

  if (!q) {
    return NextResponse.json({ artists: [] })
  }

  // The or() filter is delimited by commas and parentheses, so strip those from
  // the user's query to keep a stray "," or "(" from corrupting the filter
  // grammar. ILIKE wildcards (%, _) are left as-is, matching the other admin
  // search routes.
  const safe = q.replace(/[,()]/g, ' ').trim()
  if (!safe) {
    return NextResponse.json({ artists: [] })
  }

  const { data, error } = await supabase
    .from('artists')
    .select('id, slug, name, image_url')
    .or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
    .order('name', { ascending: true })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ artists: data ?? [] })
}
