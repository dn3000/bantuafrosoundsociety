'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

type Artist = {
  id: string
  name: string
  slug: string
  tier: 'featured' | 'active' | 'watch'
  status: 'active' | 'inactive' | 'hiatus'
  is_tracked: boolean
  country: string | null
  city: string | null
  subgenres: string[]
  image_url: string | null
  updated_at: string
  last_scanned_at: string | null
  spotify_artist_id: string | null
  youtube_topic_channel_id: string | null
  youtube_channel_id: string | null
}

type YtChannelFilter = '' | 'has_topic' | 'has_oac' | 'unresolved'

type Toast = { kind: 'info' | 'success' | 'error'; msg: string }

// Per-row state for the Scan now button. Lives outside the Artist row so a
// re-fetch (which replaces the artists array) doesn't drop in-flight status.
//
// The chip distinguishes four post-scan outcomes so the operator can tell a
// completed-with-no-new-releases run apart from a rate-limit pause or a
// failure — the latter two don't move last_scanned_at and need a retry.
//   - clean         → scan completed (published>0 OR no new releases). Stamps.
//   - rate-limited  → Spotify pushed back; don't stamp; show retry hint.
//   - error         → API errors[] non-empty OR HTTP failure; don't stamp.
type ScanRowStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'clean'; published: number; duplicates: number; oldSkipped: number }
  | { kind: 'rate-limited'; retryAfter: number | null }
  | { kind: 'error'; message: string }

// Format a Spotify Retry-After (seconds) as a compact "12h 4m" / "45m" string
// for the rate-limited chip. Values under an hour collapse to ceil(min); values
// over an hour show hours plus the ceil'd remainder minutes (or just "Nh" when
// the minute part rounds to zero).
function fmtRetry(s: number): string {
  if (s < 3600) return `${Math.ceil(s / 60)}m`
  const h = Math.floor(s / 3600)
  const m = Math.ceil((s % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Compact relative-time formatter — minutes / hours / days / months / years.
// Refreshed on each render; rows don't auto-tick (they re-render naturally on
// fetch or scan-success, which is the only time the value would change).
function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'never'
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  const mins = Math.floor(diffSec / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

const PAGE_SIZE = 50
// Each bulk request carries at most this many ids; larger selections are chunked
// across sequential calls (the server also chunks its UPDATEs at this size).
const CHUNK_SIZE = 200

function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function isRenderableImage(imageUrl: string | null): boolean {
  if (!imageUrl) return false
  if (imageUrl === 'no_spotify_image') return false
  // Basic sanity check — must look like a URL
  return imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function ArtistAvatar({ artist }: { artist: Artist }) {
  const renderable = isRenderableImage(artist.image_url)
  const initials = getInitials(artist.name)

  // Subtle tier-based background tint for placeholders
  const placeholderBg: Record<string, string> = {
    featured: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    active: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    watch: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }

  if (renderable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artist.image_url!}
        alt={artist.name}
        className="w-10 h-10 rounded-[var(--radius)] object-cover flex-shrink-0"
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`w-10 h-10 rounded-[var(--radius)] flex items-center justify-center text-xs font-semibold flex-shrink-0 ${placeholderBg[artist.tier]}`}
      aria-label={`${artist.name} placeholder`}
    >
      {initials}
    </div>
  )
}

export default function ArtistsListPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [trackedFilter, setTrackedFilter] = useState('')
  // Sort mode — see /api/admin/artists. 'updated_desc' keeps the existing
  // default; 'scanned_asc_nulls_first' surfaces never-/least-recently-scanned
  // artists so the next bulk run can prioritise them.
  const [sort, setSort] = useState<'updated_desc' | 'scanned_asc_nulls_first'>('updated_desc')
  const [page, setPage] = useState(0)

  // Selection (persists across pages so "select all matching" can span the queue)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [allMatchingCapped, setAllMatchingCapped] = useState(false)

  // Batch action
  const [actionRunning, setActionRunning] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  // Per-row Scan now state, keyed by artist id. Survives the artists[] swap
  // that follows a successful scan (we don't reset on fetch — only on a fresh
  // filter context).
  const [scanStatus, setScanStatus] = useState<Record<string, ScanRowStatus>>({})

  // Which artist's YT resolution panel is open (at most one at a time).
  const [ytOpenId, setYtOpenId] = useState<string | null>(null)

  // Client-side YT channel filter (applied to the loaded page, no refetch).
  const [ytFilter, setYtFilter] = useState<YtChannelFilter>('')

  // Fetched channel titles keyed by channel ID. Populated on-demand by
  // "Fetch channel titles"; accumulates across pages as a lightweight cache.
  const [channelTitles, setChannelTitles] = useState<Record<string, string>>({})
  const [titlesLoading, setTitlesLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE)

  // Client-side YT filter applied on top of the server-paged artists list.
  const ytFilteredArtists = ytFilter
    ? artists.filter((a) => {
        if (ytFilter === 'has_topic') return !!a.youtube_topic_channel_id
        if (ytFilter === 'has_oac') return !!a.youtube_channel_id
        if (ytFilter === 'unresolved') return !a.youtube_topic_channel_id && !a.youtube_channel_id
        return true
      })
    : artists

  const visibleIds = ytFilteredArtists.map((a) => a.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size
  const hasMoreThanPage = total > artists.length

  // Shared filter query string (everything except pagination) — used by both the
  // list fetch and the ids_only "select all matching" fetch so they stay in sync.
  // sort is included so the list reflects the chosen order; ids_only ignores
  // sort server-side (the matching id set is the same), which is fine.
  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams()
      if (search) p.set('search', search)
      if (tierFilter) p.set('tier', tierFilter)
      if (trackedFilter) p.set('tracked', trackedFilter)
      if (sort !== 'updated_desc') p.set('sort', sort)
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [search, tierFilter, trackedFilter, sort],
  )

  const fetchArtists = useCallback(async () => {
    setLoading(true)
    const qs = buildParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    try {
      const res = await fetch(`/api/admin/artists?${qs}`)
      const data = await res.json()
      if (res.ok) {
        setArtists(data.artists)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [buildParams, page])

  // A fresh filter is a fresh selection context: reset to page 1, drop selection,
  // and clear any sticky per-row scan statuses (their target rows may be paging
  // out anyway).
  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
    setAllMatchingCapped(false)
    setScanStatus({})
    setYtOpenId(null)
  }, [search, tierFilter, trackedFilter, sort])

  useEffect(() => {
    const t = setTimeout(fetchArtists, 250)
    return () => clearTimeout(t)
  }, [fetchArtists])

  // Auto-dismiss terminal toasts; progress ("info") toasts are replaced in place.
  useEffect(() => {
    if (toast && toast.kind !== 'info') {
      const t = setTimeout(() => setToast(null), 4500)
      return () => clearTimeout(t)
    }
  }, [toast])

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setAllMatchingCapped(false)
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
    setAllMatchingCapped(false)
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setAllMatchingCapped(false)
  }

  // Fetch every id matching the current filter (not just this page) so a batch
  // action can apply to the whole filtered set. True total still comes from count.
  async function selectAllMatching() {
    setSelecting(true)
    try {
      const res = await fetch(`/api/admin/artists?${buildParams({ ids_only: '1' })}`)
      const data = await res.json()
      if (res.ok) {
        setSelectedIds(new Set<string>(data.ids ?? []))
        setAllMatchingCapped(!!data.capped)
      }
    } finally {
      setSelecting(false)
    }
  }

  // POST the visible (filtered) artists' channel IDs to the batch-title endpoint.
  // On-demand only; never auto-fires. Accumulates into channelTitles cache.
  async function fetchChannelTitles() {
    const ids = [
      ...new Set(
        ytFilteredArtists.flatMap((a) =>
          ([a.youtube_topic_channel_id, a.youtube_channel_id] as (string | null)[]).filter(
            (id): id is string => !!id,
          ),
        ),
      ),
    ]
    if (ids.length === 0) return
    setTitlesLoading(true)
    try {
      const res = await fetch('/api/admin/youtube/channel-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.titles) {
        setChannelTitles((prev) => ({ ...prev, ...data.titles }))
      }
    } finally {
      setTitlesLoading(false)
    }
  }

  // Per-artist "Scan now" — fires the single-artist scan endpoint, surfaces an
  // inline status, and (only on a clean completion) patches the local row's
  // last_scanned_at so the relative-time chip flips to "just now" without a
  // refetch. Rate-limited and errored outcomes deliberately leave the stamp
  // alone so those artists stay sorted high in least-recently-scanned.
  async function runSingleScan(artist: Artist) {
    if (!artist.spotify_artist_id) return // button is disabled in this case, but be defensive
    const current = scanStatus[artist.id]
    if (current?.kind === 'running') return

    const ok = window.confirm(
      `Scan ${artist.name}? Their post-Jan-2026 releases will be published live.`,
    )
    if (!ok) return

    setScanStatus((prev) => ({ ...prev, [artist.id]: { kind: 'running' } }))

    try {
      const res = await fetch(`/api/admin/artists/${artist.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      const published = typeof data.published === 'number' ? data.published : 0
      const duplicates = typeof data.duplicates === 'number' ? data.duplicates : 0
      const oldSkipped = typeof data.oldSkipped === 'number' ? data.oldSkipped : 0
      const rateLimited = data.rateLimited === true
      const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : null
      const errs = Array.isArray(data.errors) ? data.errors : []

      // Branch by outcome. Order matters: a rate-limit is also reported via
      // errors[] (so the operator still sees the 429 in the logs), but the
      // chip should call it out as a pause, not a failure.
      if (rateLimited) {
        setScanStatus((prev) => ({
          ...prev,
          [artist.id]: { kind: 'rate-limited', retryAfter },
        }))
        return // no stamp — scan didn't complete
      }
      if (errs.length > 0) {
        setScanStatus((prev) => ({
          ...prev,
          [artist.id]: {
            kind: 'error',
            message:
              typeof errs[0]?.error === 'string' ? errs[0].error : 'Scan failed',
          },
        }))
        return // no stamp — scan didn't complete cleanly
      }

      // Clean completion (either published>0 or no new releases at all).
      // Either way the scrape ran end-to-end and we observed current state.
      setScanStatus((prev) => ({
        ...prev,
        [artist.id]: { kind: 'clean', published, duplicates, oldSkipped },
      }))
      const stampedAt = new Date().toISOString()
      setArtists((prev) =>
        prev.map((a) => (a.id === artist.id ? { ...a, last_scanned_at: stampedAt } : a)),
      )
    } catch (err) {
      // HTTP failure or network error — same visual treatment as a content
      // error; full message kept in the tooltip.
      setScanStatus((prev) => ({
        ...prev,
        [artist.id]: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Scan failed',
        },
      }))
    }
  }

  async function runBulk(action: 'track' | 'untrack') {
    if (actionRunning) return
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const noun = ids.length === 1 ? 'artist' : 'artists'
    const ok = window.confirm(
      action === 'track'
        ? `Add ${ids.length} ${noun} to the tracked whitelist? The scraper will scan them and their new drops will auto-publish.`
        : `Remove ${ids.length} ${noun} from the tracked whitelist? The scraper will stop scanning them.`,
    )
    if (!ok) return

    const chunks = chunk(ids, CHUNK_SIZE)
    const verb = action === 'track' ? 'Adding to tracked' : 'Removing from tracked'
    const verbPast = action === 'track' ? 'Added to tracked' : 'Removed from tracked'

    setActionRunning(true)
    let updated = 0
    try {
      for (let i = 0; i < chunks.length; i++) {
        setToast({
          kind: 'info',
          msg:
            chunks.length > 1
              ? `${verb} ${ids.length}… (batch ${i + 1}/${chunks.length})`
              : `${verb} ${ids.length}…`,
        })
        const res = await fetch('/api/admin/artists/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: chunks[i], action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
        updated += data.updated ?? 0
      }
      setToast({ kind: 'success', msg: `${verbPast} ${updated} ${updated === 1 ? 'artist' : 'artists'}.` })
      clearSelection()
      await fetchArtists()
    } catch (err) {
      setToast({
        kind: 'error',
        msg: `Failed after ${updated} updated — ${err instanceof Error ? err.message : 'unknown error'}`,
      })
    } finally {
      setActionRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-28">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Artists
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} {total === 1 ? 'artist' : 'artists'} in the scene graph
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Back to dashboard
            </Link>
            <Link
              href="/admin/artists/backfill"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              Backfill
            </Link>
            <Link
              href="/admin/artists/musicbrainz"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              MusicBrainz
            </Link>
            <Link
              href="/admin/artists/import"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              Import from playlist
            </Link>
            <Link
              href="/admin/artists/new"
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Add artist
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="">All tiers</option>
            <option value="featured">Featured</option>
            <option value="active">Active</option>
            <option value="watch">Watch</option>
          </select>
          <select
            value={trackedFilter}
            onChange={(e) => setTrackedFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="">All artists</option>
            <option value="true">Tracked only</option>
            <option value="false">Untracked stubs</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'updated_desc' | 'scanned_asc_nulls_first')}
            aria-label="Sort order"
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="scanned_asc_nulls_first">Least recently scanned</option>
          </select>
          <select
            value={ytFilter}
            onChange={(e) => setYtFilter(e.target.value as YtChannelFilter)}
            aria-label="YouTube channel filter"
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="">All (YT)</option>
            <option value="has_topic">Has Topic channel</option>
            <option value="has_oac">Has OAC</option>
            <option value="unresolved">Unresolved (no Topic, no OAC)</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : artists.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)] mb-4">
              {total === 0 ? 'No artists yet.' : 'No artists match your filters.'}
            </p>
            {total === 0 && (
              <Link
                href="/admin/artists/new"
                className="inline-block bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Add the first artist
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Selection toolbar */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--color-fg-tertiary)] mb-3 px-1">
              <label className="flex items-center gap-2 cursor-pointer text-[var(--color-fg-secondary)]">
                <TriCheckbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected && !allVisibleSelected}
                  onChange={toggleAllVisible}
                  ariaLabel="Select all on this page"
                />
                Select page
              </label>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] underline-offset-2 hover:underline"
                >
                  Clear selection ({selectedCount})
                </button>
              )}
              <div className="flex-1" />
              <span>
                Showing {showingFrom}–{showingTo} of {total}
              </span>
            </div>

            {/* Select-all-matching banner */}
            {allVisibleSelected && hasMoreThanPage && (
              <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-[var(--radius)] px-4 py-2.5 mb-3 text-sm flex items-center gap-3 flex-wrap">
                {selectedCount >= total ? (
                  <span className="text-[var(--color-fg-secondary)]">
                    All <strong className="text-[var(--color-fg-primary)]">{total}</strong> matching artists are selected.
                    {allMatchingCapped && (
                      <span className="text-[var(--color-warning)]"> (capped at {selectedCount} — refine the filter)</span>
                    )}
                  </span>
                ) : (
                  <>
                    <span className="text-[var(--color-fg-secondary)]">
                      All {artists.length} on this page are selected.
                    </span>
                    <button
                      type="button"
                      onClick={selectAllMatching}
                      disabled={selecting}
                      className="font-semibold text-[var(--color-accent)] hover:underline disabled:opacity-50"
                    >
                      {selecting ? 'Selecting…' : `Select all ${total} matching this filter`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Fetch channel titles — on-demand, never auto-fires */}
            {ytFilteredArtists.some((a) => a.youtube_topic_channel_id || a.youtube_channel_id) && (
              <div className="flex items-center gap-3 mb-3 px-1">
                <button
                  type="button"
                  onClick={fetchChannelTitles}
                  disabled={titlesLoading}
                  className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {titlesLoading ? 'Fetching titles…' : 'Fetch channel titles'}
                </button>
                {Object.keys(channelTitles).length > 0 && (
                  <span className="text-[10px] text-[var(--color-fg-tertiary)]">
                    {Object.keys(channelTitles).length} titles cached
                  </span>
                )}
              </div>
            )}

            <ul className="space-y-2">
              {ytFilteredArtists.map((artist) => {
                const selected = selectedIds.has(artist.id)
                const scan = scanStatus[artist.id] ?? { kind: 'idle' as const }
                const hasSpotifyId = !!artist.spotify_artist_id
                return (
                  <li
                    key={artist.id}
                    className={`bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] transition-colors ${
                      selected ? 'ring-1 ring-[var(--color-accent)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOne(artist.id)}
                        aria-label={`Select ${artist.name}`}
                        className="w-4 h-4 accent-[var(--color-accent)] flex-shrink-0 cursor-pointer"
                      />
                      <Link
                        href={`/admin/artists/${artist.slug}`}
                        className="flex items-center gap-3 flex-1 min-w-0 rounded-[var(--radius)] hover:opacity-90"
                      >
                        <ArtistAvatar artist={artist} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[var(--color-fg-primary)] truncate">
                              {artist.name}
                            </span>
                            <TierBadge tier={artist.tier} />
                            {artist.is_tracked ? (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-semibold">
                                tracked
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] font-semibold">
                                stub
                              </span>
                            )}
                            {artist.status !== 'active' && (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] font-semibold">
                                {artist.status}
                              </span>
                            )}
                          </div>
                          {(artist.city || artist.country) && (
                            <p className="text-xs text-[var(--color-fg-secondary)] mt-0.5">
                              {[artist.city, artist.country].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      </Link>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setYtOpenId((prev) => (prev === artist.id ? null : artist.id))}
                            className={`text-xs font-semibold rounded-[var(--radius)] px-2.5 py-1 border transition-colors ${
                              ytOpenId === artist.id
                                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                                : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)]'
                            }`}
                          >
                            Resolve YT
                          </button>
                          <button
                            type="button"
                            onClick={() => runSingleScan(artist)}
                            disabled={!hasSpotifyId || scan.kind === 'running'}
                            title={hasSpotifyId ? 'Scan this artist for new Spotify releases' : 'No Spotify ID'}
                            className="text-xs font-semibold rounded-[var(--radius)] px-2.5 py-1 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {scan.kind === 'running' ? 'Scanning…' : 'Scan now'}
                          </button>
                        </div>
                        <ScanRowStatusChip status={scan} lastScannedAt={artist.last_scanned_at} />
                        {(artist.youtube_topic_channel_id || artist.youtube_channel_id) && (
                          <div className="flex flex-col items-end gap-0.5 mt-0.5">
                            <div className="flex items-center gap-2">
                              {artist.youtube_topic_channel_id && (
                                <a
                                  href={`https://music.youtube.com/channel/${artist.youtube_topic_channel_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                                >
                                  Topic ↗
                                </a>
                              )}
                              {artist.youtube_channel_id && (
                                <a
                                  href={`https://www.youtube.com/channel/${artist.youtube_channel_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                                >
                                  OAC ↗
                                </a>
                              )}
                            </div>
                            {artist.youtube_topic_channel_id &&
                              channelTitles[artist.youtube_topic_channel_id] && (
                                <span className="text-[9px] font-mono text-[var(--color-fg-tertiary)] truncate max-w-[160px]">
                                  {channelTitles[artist.youtube_topic_channel_id]}
                                </span>
                              )}
                            {artist.youtube_channel_id &&
                              channelTitles[artist.youtube_channel_id] && (
                                <span className="text-[9px] font-mono text-[var(--color-fg-tertiary)] truncate max-w-[160px]">
                                  {channelTitles[artist.youtube_channel_id]}
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                    {ytOpenId === artist.id && (
                      <YtResolutionPanel
                        slug={artist.slug}
                        name={artist.name}
                        onClose={() => setYtOpenId(null)}
                        onSaved={fetchArtists}
                      />
                    )}
                  </li>
                )
              })}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-[var(--color-fg-tertiary)]">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 right-4 z-50 max-w-sm rounded-[var(--radius)] px-4 py-3 text-sm shadow-lg border ${
            toast.kind === 'success'
              ? 'bg-[var(--color-bg-elevated)] border-[var(--color-success)] text-[var(--color-fg-primary)]'
              : toast.kind === 'error'
                ? 'bg-[var(--color-bg-elevated)] border-[var(--color-error)] text-[var(--color-fg-primary)]'
                : 'bg-[var(--color-bg-elevated)] border-[var(--color-border-default)] text-[var(--color-fg-secondary)]'
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}

      {/* Sticky batch bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-[var(--color-fg-primary)]">
              {selectedCount} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Clear
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runBulk('track')}
                disabled={actionRunning}
                className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionRunning ? 'Working…' : `Add to tracked (${selectedCount})`}
              </button>
              <button
                type="button"
                onClick={() => runBulk('untrack')}
                disabled={actionRunning}
                className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Remove from tracked
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── YouTube resolution panel ──────────────────────────────────────────────

type YtChannelInfo = {
  channelId: string
  title: string
  thumbnail: string | null
  isTopic: boolean
}

type YtPanelStep = 'idle' | 'loading' | 'suggesting' | 'resolving' | 'saving'

function YtResolutionPanel({
  slug,
  name,
  onClose,
  onSaved,
}: {
  slug: string
  name: string
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState<YtPanelStep>('loading')
  const [currentOacId, setCurrentOacId] = useState<string | null>(null)
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

  // Auto-resolve state
  const [proposedOac, setProposedOac] = useState<YtChannelInfo | null>(null)
  const [proposedTopic, setProposedTopic] = useState<YtChannelInfo | null>(null)
  const [confirmOac, setConfirmOac] = useState(false)
  const [confirmTopic, setConfirmTopic] = useState(false)
  const [hasSuggestions, setHasSuggestions] = useState(false)

  // Paste resolve state
  const [pasteInput, setPasteInput] = useState('')
  const [pasteResult, setPasteResult] = useState<YtChannelInfo | null>(null)
  const [pasteSlot, setPasteSlot] = useState<'oac' | 'topic' | null>(null)
  const [pasteConfirmed, setPasteConfirmed] = useState(false)

  // Load current IDs on open
  useEffect(() => {
    let cancelled = false
    async function load() {
      setStep('loading')
      try {
        const res = await fetch(`/api/admin/artists/${slug}`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          setCurrentOacId(data.artist?.youtube_channel_id ?? null)
          setCurrentTopicId(data.artist?.youtube_topic_channel_id ?? null)
        }
      } finally {
        if (!cancelled) setStep('idle')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug])

  async function handleAutoResolve() {
    setStep('suggesting')
    setPanelError(null)
    try {
      const res = await fetch(`/api/admin/artists/${slug}/youtube/suggest`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Suggest failed')
      const oac: YtChannelInfo | null = data.oac
        ? { ...data.oac, isTopic: false }
        : null
      const topic: YtChannelInfo | null = data.topic
        ? { ...data.topic, isTopic: true }
        : null
      setProposedOac(oac)
      setProposedTopic(topic)
      setConfirmOac(!!oac)
      setConfirmTopic(!!topic)
      setHasSuggestions(true)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to get suggestions')
    } finally {
      setStep('idle')
    }
  }

  async function handlePasteResolve() {
    if (!pasteInput.trim()) return
    setStep('resolving')
    setPanelError(null)
    try {
      const res = await fetch(`/api/admin/artists/${slug}/youtube/resolve-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: pasteInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Resolve failed')
      const info: YtChannelInfo = {
        channelId: data.channelId,
        title: data.title,
        thumbnail: data.thumbnail ?? null,
        isTopic: !!data.isTopic,
      }
      setPasteResult(info)
      setPasteSlot(info.isTopic ? 'topic' : 'oac')
      setPasteConfirmed(true)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setStep('idle')
    }
  }

  async function handleSave() {
    const updates: Record<string, string | null> = {}
    if (hasSuggestions) {
      if (confirmOac && proposedOac) updates.youtube_channel_id = proposedOac.channelId
      if (confirmTopic && proposedTopic) updates.youtube_topic_channel_id = proposedTopic.channelId
    }
    if (pasteResult && pasteConfirmed && pasteSlot) {
      updates[pasteSlot === 'oac' ? 'youtube_channel_id' : 'youtube_topic_channel_id'] =
        pasteResult.channelId
    }
    if (Object.keys(updates).length === 0) return

    setStep('saving')
    setPanelError(null)
    try {
      const res = await fetch(`/api/admin/artists/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setCurrentOacId(data.artist?.youtube_channel_id ?? currentOacId)
      setCurrentTopicId(data.artist?.youtube_topic_channel_id ?? currentTopicId)
      setHasSuggestions(false)
      setProposedOac(null)
      setProposedTopic(null)
      setPasteResult(null)
      setPasteInput('')
      onSaved()
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setStep('idle')
    }
  }

  const isBusy = step !== 'idle'
  const hasChanges =
    (hasSuggestions && (confirmOac || confirmTopic)) ||
    (pasteResult !== null && pasteConfirmed && pasteSlot !== null)

  return (
    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] rounded-b-[var(--radius-md)] px-3 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-[var(--color-fg-tertiary)] font-medium">YouTube:</span>
          <span className={currentOacId ? 'text-[var(--color-success)]' : 'text-[var(--color-fg-tertiary)]'}>
            OAC {currentOacId ? '✓' : '—'}
            {currentOacId && (
              <span className="ml-1 font-mono text-[9px] text-[var(--color-fg-tertiary)]">
                {currentOacId.slice(0, 12)}…
              </span>
            )}
          </span>
          <span className={currentTopicId ? 'text-[var(--color-success)]' : 'text-[var(--color-fg-tertiary)]'}>
            Topic {currentTopicId ? '✓' : '—'}
            {currentTopicId && (
              <span className="ml-1 font-mono text-[9px] text-[var(--color-fg-tertiary)]">
                {currentTopicId.slice(0, 12)}…
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
        >
          ✕
        </button>
      </div>

      {step === 'loading' ? (
        <p className="text-xs text-[var(--color-fg-tertiary)]">Loading…</p>
      ) : (
        <>
          {/* Auto-resolve */}
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={handleAutoResolve}
                disabled={isBusy}
                className="text-xs font-semibold rounded-[var(--radius)] px-2.5 py-1 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {step === 'suggesting' ? 'Searching…' : 'Auto-resolve'}
              </button>
              <span className="text-[10px] text-[var(--color-fg-tertiary)]">
                uses ~2 of your ~100 daily YouTube searches
              </span>
            </div>
            {hasSuggestions && (
              <div className="grid grid-cols-2 gap-2">
                <YtChannelCard
                  label="Topic channel"
                  channel={proposedTopic}
                  confirmed={confirmTopic}
                  onToggle={() => setConfirmTopic((v) => !v)}
                />
                <YtChannelCard
                  label="Official Artist Channel"
                  channel={proposedOac}
                  confirmed={confirmOac}
                  onToggle={() => setConfirmOac((v) => !v)}
                />
              </div>
            )}
          </div>

          {/* Manual paste */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Paste channel URL or @handle…"
                value={pasteInput}
                onChange={(e) => {
                  setPasteInput(e.target.value)
                  setPasteResult(null)
                  setPasteConfirmed(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isBusy && pasteInput.trim()) handlePasteResolve()
                }}
                className="flex-1 text-xs bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1.5 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
              />
              <button
                type="button"
                onClick={handlePasteResolve}
                disabled={!pasteInput.trim() || isBusy}
                className="text-xs font-semibold rounded-[var(--radius)] px-2.5 py-1 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {step === 'resolving' ? 'Resolving…' : 'Resolve'}
              </button>
            </div>

            {pasteResult && (
              <div className="mt-2 p-2 bg-[var(--color-bg-elevated)] rounded-[var(--radius)] border border-[var(--color-border-subtle)] flex items-center gap-2">
                {pasteResult.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pasteResult.thumbnail}
                    alt=""
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--color-fg-primary)] truncate">
                    {pasteResult.title}
                  </p>
                  <p className="font-mono text-[9px] text-[var(--color-fg-tertiary)]">
                    {pasteResult.channelId}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <select
                    value={pasteSlot ?? 'oac'}
                    onChange={(e) => setPasteSlot(e.target.value as 'oac' | 'topic')}
                    className="text-[10px] bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded px-1 py-0.5 text-[var(--color-fg-primary)]"
                  >
                    <option value="oac">OAC</option>
                    <option value="topic">Topic</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPasteConfirmed((v) => !v)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      pasteConfirmed
                        ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-fg-primary)]'
                        : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    {pasteConfirmed ? '✓ Confirmed' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {panelError && (
            <p className="text-[10px] text-red-400 mb-2">{panelError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isBusy}
              className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {step === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function YtChannelCard({
  label,
  channel,
  confirmed,
  onToggle,
}: {
  label: string
  channel: YtChannelInfo | null
  confirmed: boolean
  onToggle: () => void
}) {
  if (!channel) {
    return (
      <div className="p-2 rounded-[var(--radius)] border border-[var(--color-border-subtle)] text-center">
        <p className="text-[10px] text-[var(--color-fg-tertiary)] font-medium">{label}</p>
        <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-0.5">Not found</p>
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      className={`p-2 rounded-[var(--radius)] border cursor-pointer transition-colors ${
        confirmed
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]'
      }`}
    >
      <p className="text-[9px] uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {channel.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.thumbnail}
            alt=""
            className="w-6 h-6 rounded object-cover flex-shrink-0"
          />
        )}
        <p className="text-[10px] font-medium text-[var(--color-fg-primary)] truncate">
          {channel.title}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[9px] text-[var(--color-fg-tertiary)]">
          {channel.channelId.slice(0, 14)}…
        </span>
        <span
          className={`text-[10px] ${confirmed ? 'text-[var(--color-accent)]' : 'text-[var(--color-fg-tertiary)]'}`}
        >
          {confirmed ? '✓' : 'click to confirm'}
        </span>
      </div>
    </div>
  )
}

// ─── End YouTube resolution panel ──────────────────────────────────────────

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
    />
  )
}

// Inline status chip for the Scan now button. Idle shows the relative-time
// stamp; running shows the spinner text; the three terminal states (clean,
// rate-limited, error) render distinct labels and colours so the operator can
// tell them apart at a glance — a clean "+0 published" looks nothing like
// "rate-limited" or "error", which both look nothing like a successful run.
function ScanRowStatusChip({
  status,
  lastScannedAt,
}: {
  status: ScanRowStatus
  lastScannedAt: string | null
}) {
  if (status.kind === 'running') {
    return (
      <span className="text-[10px] text-[var(--color-fg-tertiary)] font-mono">
        Scanning…
      </span>
    )
  }
  if (status.kind === 'rate-limited') {
    const suffix =
      status.retryAfter !== null ? ` · retry in ~${fmtRetry(status.retryAfter)}` : ''
    return (
      <span className="text-[10px] text-amber-400 font-mono">
        ⏸ Rate-limited{suffix}
      </span>
    )
  }
  if (status.kind === 'error') {
    return (
      <span
        className="text-[10px] text-red-400 font-mono"
        title={status.message}
      >
        ⚠ Error · check logs
      </span>
    )
  }
  if (status.kind === 'clean') {
    if (status.published > 0) {
      return (
        <span className="text-[10px] text-[var(--color-success)] font-mono">
          +{status.published} published · {status.duplicates} dupes
        </span>
      )
    }
    // Clean zero — scan ran end-to-end and found nothing new. oldSkipped > 0
    // means the artist HAS recent releases, just nothing past sinceDate.
    return (
      <span className="text-[10px] text-zinc-400 font-mono">
        {status.oldSkipped > 0
          ? `No new releases · ${status.oldSkipped} older skipped`
          : 'No new releases'}
      </span>
    )
  }
  return (
    <span className="text-[10px] text-[var(--color-fg-tertiary)] font-mono">
      Last scanned: {formatRelativeTime(lastScannedAt)}
    </span>
  )
}

function TierBadge({ tier }: { tier: 'featured' | 'active' | 'watch' }) {
  const styles: Record<string, string> = {
    featured: 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]',
    active: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    watch: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${styles[tier]}`}>
      {tier}
    </span>
  )
}
