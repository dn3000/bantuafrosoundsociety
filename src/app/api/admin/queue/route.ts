import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  SUBMISSION_TYPES,
  VIDEO_CATEGORIES,
  submissionToQueueItem,
  videoToQueueItem,
  type SubmissionRow,
  type VideoRow,
} from '@/lib/queue'

// Unified review queue feed: submissions + videos in one list.
//
// Implementation note: NO SQL UNION (the two tables have divergent shapes and
// status enums). Instead we run two filtered queries in parallel, map each to
// the normalized QueueItem shape, merge, and sort by created_at desc in JS.
// Pagination is a created_at cursor shared across both tables.

const ALLOWED_STATUS = ['pending', 'deferred', 'needs_work', 'all'] as const
type StatusParam = (typeof ALLOWED_STATUS)[number]

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const SUBMISSION_SELECT =
  'id, type, title, source, source_url, source_method, status, priority, artwork_url, cover_image_url, release_date, created_at, artists!submissions_primary_artist_id_fkey(id, name, slug, image_url)'
const VIDEO_SELECT =
  'id, youtube_video_id, title, category, status, source_method, thumbnail_url, published_at, is_exclusive, created_at, artists(id, name, slug, image_url)'

type ParsedFilters = {
  subTypes: string[]
  vidCats: string[]
  methods: string[]
  artistId: string | null
  q: string
}

// Apply the shared (non-status, non-cursor) filters to a submissions query.
function applySubFilters<T>(query: T, f: ParsedFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (f.subTypes.length) q = q.in('type', f.subTypes)
  if (f.methods.length) q = q.in('source_method', f.methods)
  if (f.artistId) q = q.eq('primary_artist_id', f.artistId)
  if (f.q) q = q.ilike('title', `%${f.q}%`)
  return q as T
}

function applyVidFilters<T>(query: T, f: ParsedFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (f.vidCats.length) q = q.in('category', f.vidCats)
  if (f.methods.length) q = q.in('source_method', f.methods)
  if (f.artistId) q = q.eq('artist_id', f.artistId)
  if (f.q) q = q.ilike('title', `%${f.q}%`)
  return q as T
}

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)

  const statusRaw = (searchParams.get('status') || 'pending') as StatusParam
  const status: StatusParam = (ALLOWED_STATUS as readonly string[]).includes(statusRaw) ? statusRaw : 'pending'

  const typeReq = (searchParams.get('type') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const typeActive = typeReq.length > 0
  const subTypes = typeReq.filter((t) => (SUBMISSION_TYPES as readonly string[]).includes(t))
  const vidCats = typeReq.filter((t) => (VIDEO_CATEGORIES as readonly string[]).includes(t))

  const methods = (searchParams.get('source_method') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const artistId = searchParams.get('artist_id')?.trim() || null
  const q = searchParams.get('q')?.trim() || ''
  const cursor = searchParams.get('cursor')?.trim() || null
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  const f: ParsedFilters = { subTypes, vidCats, methods, artistId, q }

  // When a type filter is set but resolves to no types for a table, that table
  // can contribute nothing — skip it. Videos additionally have no
  // deferred/needs_work status, so those tabs always show zero videos.
  const skipSubsByType = typeActive && subTypes.length === 0
  const skipVidsByType = typeActive && vidCats.length === 0
  const skipVidsByStatus = status === 'deferred' || status === 'needs_work'

  // ----- Build the data queries -----
  const subsStatusEq = status === 'all' ? null : status // pending | deferred | needs_work

  async function fetchSubs(): Promise<SubmissionRow[]> {
    if (skipSubsByType) return []
    let query = supabase.from('submissions').select(SUBMISSION_SELECT)
    query = applySubFilters(query, f)
    if (subsStatusEq) query = query.eq('status', subsStatusEq)
    if (cursor) query = query.lt('created_at', cursor)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`submissions: ${error.message}`)
    return (data ?? []) as unknown as SubmissionRow[]
  }

  async function fetchVids(): Promise<VideoRow[]> {
    if (skipVidsByType || skipVidsByStatus) return []
    let query = supabase.from('videos').select(VIDEO_SELECT)
    query = applyVidFilters(query, f)
    if (status === 'pending') query = query.eq('status', 'pending')
    // status === 'all' → no status filter
    if (cursor) query = query.lt('created_at', cursor)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`videos: ${error.message}`)
    return (data ?? []) as unknown as VideoRow[]
  }

  // ----- Tab counts (respect every filter EXCEPT status) -----
  async function countSubs(s: string): Promise<number> {
    if (skipSubsByType) return 0
    let query = supabase.from('submissions').select('id', { count: 'exact', head: true })
    query = applySubFilters(query, f)
    const { count, error } = await query.eq('status', s)
    if (error) throw new Error(`count submissions/${s}: ${error.message}`)
    return count ?? 0
  }
  async function countPendingVids(): Promise<number> {
    if (skipVidsByType) return 0
    let query = supabase.from('videos').select('id', { count: 'exact', head: true })
    query = applyVidFilters(query, f)
    const { count, error } = await query.eq('status', 'pending')
    if (error) throw new Error(`count videos/pending: ${error.message}`)
    return count ?? 0
  }

  try {
    const [subRows, vidRows, pendingSubs, pendingVids, deferred, needsWork] = await Promise.all([
      fetchSubs(),
      fetchVids(),
      countSubs('pending'),
      countPendingVids(),
      countSubs('deferred'),
      countSubs('needs_work'),
    ])

    const merged = [...subRows.map(submissionToQueueItem), ...vidRows.map(videoToQueueItem)].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    )
    const items = merged.slice(0, limit)
    const hasMore = merged.length > limit || subRows.length >= limit || vidRows.length >= limit
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null

    return NextResponse.json({
      counts: {
        pending_submissions: pendingSubs,
        pending_videos: pendingVids,
        deferred,
        needs_work: needsWork,
      },
      items,
      nextCursor,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Queue fetch failed' }, { status: 500 })
  }
}
