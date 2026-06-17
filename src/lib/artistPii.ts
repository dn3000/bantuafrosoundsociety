// PII columns relocated from public.artists into the admin-only
// public.artists_private table (Phase 2 — migration 20260617000002).
//
// Centralised here so the artist CRUD route, the create route, and the admin
// detail page all split writes and merge reads against the SAME field list and
// can't drift. The public artists table no longer has any of these columns.

export const ARTIST_PII_FIELDS = [
  'real_name',
  'added_by',
  'email',
  'manager_name',
  'manager_email',
  'booking_agency',
  'last_contacted_at',
  'relationship_status',
  'private_notes',
] as const

export type ArtistPiiField = (typeof ARTIST_PII_FIELDS)[number]

const PII_SET: ReadonlySet<string> = new Set(ARTIST_PII_FIELDS)

/**
 * Partition an update map into the columns that stay on `artists` versus the
 * ones that now live on `artists_private`.
 */
export function splitArtistUpdates(updates: Record<string, unknown>): {
  publicUpdates: Record<string, unknown>
  privateUpdates: Record<string, unknown>
} {
  const publicUpdates: Record<string, unknown> = {}
  const privateUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (PII_SET.has(key)) privateUpdates[key] = value
    else publicUpdates[key] = value
  }
  return { publicUpdates, privateUpdates }
}

/**
 * Flatten a public `artists` row together with its `artists_private` row (if
 * any) into the single shape the admin UI expects — the same shape callers got
 * from `select('*')` before the split. Only the PII columns are lifted from the
 * private row, so the public row's own bookkeeping (id / created_at /
 * updated_at) is never clobbered. A missing private row yields null PII.
 */
export function mergeArtistPrivate(
  publicRow: Record<string, unknown>,
  privateRow: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...publicRow }
  for (const field of ARTIST_PII_FIELDS) {
    merged[field] = privateRow ? privateRow[field] ?? null : null
  }
  return merged
}
