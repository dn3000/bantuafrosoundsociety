// =========================================
// Unified Review Queue (β) — shared types, provenance vocab, and row mappers.
// =========================================
// Pure module: NO server-only imports, safe to import from client components.
// The endpoint (api/admin/queue) maps DB rows → QueueItem with these helpers;
// QueueClient + ReviewCard consume the same shapes and the same vocab so the
// feed, the filter chips, and the card never drift.
//
// Vocab is grounded in the migration CHECK constraints:
//   submissions.type     — 20260601000001
//   submissions.status   — 20260601000001 + 20260602000003
//   submissions.source_method — 20260601000001 + 20260610000001
//   videos.category      — 20260610000002 + 20260611000001
//   videos.status        — 20260610000002
//   videos.source_method — 20260610000002 (DEFAULT 'youtube-oac', no CHECK)

export type QueueSource = 'submission' | 'video'
export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'needs_work'

export type QueueArtist = {
  id: string
  slug: string
  name: string
  image_url: string | null
}

export type QueueItem = {
  id: string
  source: QueueSource
  status: QueueStatus
  title: string
  thumbnail_url: string | null
  external_url: string | null
  source_url: string | null
  source_method: string | null
  created_at: string
  /** Normalized type key: submission.type OR video.category. */
  type: string
  primary_artist: QueueArtist | null
  /** Source-specific extras the card may surface. */
  payload: Record<string, unknown>
}

// ----- Type / category vocab (normalized under one `type` key) -----
export const SUBMISSION_TYPES = ['single', 'release', 'mix', 'dj_set', 'playlist', 'video', 'podcast'] as const
export const VIDEO_CATEGORIES = ['mix', 'live_set', 'live_show', 'music_video', 'interview', 'other'] as const

export const TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  release: 'Release',
  mix: 'Mix',
  dj_set: 'DJ Set',
  playlist: 'Playlist',
  video: 'Video',
  podcast: 'Podcast',
  live_set: 'Live Set',
  live_show: 'Live Show',
  music_video: 'Music Video',
  interview: 'Interview',
  other: 'Other',
}

// ----- Provenance (source_method) vocab — the first-class triage filter -----
export const SUBMISSION_SOURCE_METHODS = [
  'scraper',
  'manual',
  'contributor_submission',
  'spotify-playlist',
  'youtube-topic',
] as const
export const VIDEO_SOURCE_METHODS = ['youtube-oac'] as const

export const SOURCE_METHOD_LABELS: Record<string, string> = {
  scraper: 'Spotify scraper',
  manual: 'Manual / paste-a-link',
  contributor_submission: 'Contributor',
  'spotify-playlist': 'Spotify playlist',
  'youtube-topic': 'YouTube Topic',
  'youtube-oac': 'YouTube OAC',
}

/**
 * The full set of provenance values across BOTH tables (submissions ∪ videos),
 * derived from the CHECK constraints / column defaults. This is the distinct
 * universe of source_method values the queue can ever contain — used to build
 * the filter chips. (PostgREST has no efficient runtime SELECT DISTINCT, and
 * the constraints already enumerate the possibilities.)
 */
export const ALL_SOURCE_METHODS: { value: string; label: string; source: QueueSource }[] = [
  ...SUBMISSION_SOURCE_METHODS.map((value) => ({ value, label: SOURCE_METHOD_LABELS[value] ?? value, source: 'submission' as const })),
  ...VIDEO_SOURCE_METHODS.map((value) => ({ value, label: SOURCE_METHOD_LABELS[value] ?? value, source: 'video' as const })),
]

export function typeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return TYPE_LABELS[t] ?? t
}

export function sourceMethodLabel(m: string | null | undefined): string {
  if (!m) return 'Unknown source'
  return SOURCE_METHOD_LABELS[m] ?? m
}

// ----- Image helpers (shared by endpoint + card) -----
export function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export function pickImage(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) if (isRenderableImage(c)) return c as string
  return null
}

export function initialsFor(name: string): string {
  const cleaned = (name || '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ----- Row → QueueItem mappers (pure) -----
// PostgREST embeds a to-one relation as an object, but generated types often
// widen it to `T | T[]`; normalize defensively.
type ArtistEmbed = QueueArtist | QueueArtist[] | null

function firstArtist(a: ArtistEmbed): QueueArtist | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

export type SubmissionRow = {
  id: string
  type: string
  title: string
  source: string | null
  source_url: string | null
  source_method: string | null
  status: QueueStatus
  priority: string | null
  artwork_url: string | null
  cover_image_url: string | null
  release_date: string | null
  created_at: string
  artists: ArtistEmbed
}

export type VideoRow = {
  id: string
  youtube_video_id: string
  title: string
  category: string
  status: QueueStatus
  source_method: string | null
  thumbnail_url: string | null
  published_at: string | null
  is_exclusive: boolean | null
  created_at: string
  artists: ArtistEmbed
}

export function submissionToQueueItem(row: SubmissionRow): QueueItem {
  return {
    id: row.id,
    source: 'submission',
    status: row.status,
    title: row.title,
    // Resolve artwork → cover here; the card completes the chain with the
    // artist image then initials.
    thumbnail_url: pickImage(row.artwork_url, row.cover_image_url),
    external_url: isRenderableImage(row.source_url) ? row.source_url : null,
    source_url: row.source_url,
    source_method: row.source_method,
    created_at: row.created_at,
    type: row.type,
    primary_artist: firstArtist(row.artists),
    payload: {
      priority: row.priority,
      release_date: row.release_date,
      source: row.source,
      artwork_url: row.artwork_url,
      cover_image_url: row.cover_image_url,
    },
  }
}

export function videoToQueueItem(row: VideoRow): QueueItem {
  return {
    id: row.id,
    source: 'video',
    status: row.status,
    title: row.title,
    thumbnail_url: pickImage(row.thumbnail_url),
    external_url: `https://www.youtube.com/watch?v=${row.youtube_video_id}`,
    source_url: null,
    source_method: row.source_method,
    created_at: row.created_at,
    type: row.category,
    primary_artist: firstArtist(row.artists),
    payload: {
      category: row.category,
      published_at: row.published_at,
      is_exclusive: !!row.is_exclusive,
      youtube_video_id: row.youtube_video_id,
    },
  }
}
