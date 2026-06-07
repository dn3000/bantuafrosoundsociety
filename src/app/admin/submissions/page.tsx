'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

type Submission = {
  id: string
  type: 'single' | 'release' | 'mix' | 'dj_set' | 'playlist' | 'video' | 'podcast'
  title: string
  source: string | null
  source_url: string | null
  description: string | null
  cover_image_url: string | null
  artwork_url: string | null
  release_date: string | null
  status: 'pending' | 'approved' | 'rejected' | 'deferred' | 'needs_work'
  priority: 'low' | 'normal' | 'high'
  source_method: string | null
  created_at: string
  artists: {
    id: string
    name: string
    slug: string
    image_url: string | null
  } | null
}

const PAGE_SIZE = 100
// Keep each bulk request small enough to stay well within URL/row limits; the
// server also caps this. The UI chunks any larger selection across calls.
const CHUNK_SIZE = 200

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple_music', label: 'Apple Music' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'youtube_music', label: 'YouTube Music' },
  { value: 'beatport', label: 'Beatport' },
  { value: 'bandcamp', label: 'Bandcamp' },
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'mixcloud', label: 'Mixcloud' },
  { value: 'tidal', label: 'Tidal' },
  { value: 'other', label: 'Other' },
]
const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((o) => [o.value, o.label]),
)

type Toast = { kind: 'info' | 'success' | 'error'; msg: string }

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

// Thumbnail source priority: artwork_url → cover_image_url → artist image.
function pickImageSrc(s: Submission): string | null {
  if (isRenderableImage(s.artwork_url)) return s.artwork_url
  if (isRenderableImage(s.cover_image_url)) return s.cover_image_url
  if (isRenderableImage(s.artists?.image_url)) return s.artists!.image_url
  return null
}

// Mirrors the initials-fallback used by ArtistAvatar on the artists list.
function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function formatReleaseDate(d: string | null): string {
  if (!d) return 'No date'
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('list')

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [sort, setSort] = useState<'created_at' | 'release_date'>('created_at')
  const [page, setPage] = useState(0)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [allMatchingCapped, setAllMatchingCapped] = useState(false)

  // Batch action
  const [actionRunning, setActionRunning] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE)

  const visibleIds = submissions.map((s) => s.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))

  // Build the shared filter query string (everything except pagination).
  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams()
      if (statusFilter) p.set('status', statusFilter)
      if (typeFilter) p.set('type', typeFilter)
      if (sourceFilter) p.set('source', sourceFilter)
      if (search) p.set('search', search)
      if (artistSearch) p.set('artist', artistSearch)
      if (sort) p.set('sort', sort)
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [statusFilter, typeFilter, sourceFilter, search, artistSearch, sort],
  )

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    const qs = buildParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    try {
      const res = await fetch(`/api/admin/submissions?${qs}`)
      const data = await res.json()
      if (res.ok) {
        setSubmissions(data.submissions ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [buildParams, page])

  // Reset to first page and drop selection whenever the filter context changes —
  // a fresh filter is a fresh review context.
  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
    setAllMatchingCapped(false)
    setRejectOpen(false)
  }, [statusFilter, typeFilter, sourceFilter, search, artistSearch, sort])

  useEffect(() => {
    const t = setTimeout(fetchSubmissions, 250)
    return () => clearTimeout(t)
  }, [fetchSubmissions])

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
    setRejectOpen(false)
  }

  // Fetch every id matching the current filter (not just this page) so the batch
  // action can apply to the whole queue. The true total still comes from the count.
  async function selectAllMatching() {
    setSelecting(true)
    try {
      const res = await fetch(`/api/admin/submissions?${buildParams({ ids_only: '1' })}`)
      const data = await res.json()
      if (res.ok) {
        setSelectedIds(new Set<string>(data.ids ?? []))
        setAllMatchingCapped(!!data.capped)
      }
    } finally {
      setSelecting(false)
    }
  }

  async function runBulk(action: 'approve' | 'reject') {
    if (actionRunning) return
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    if (action === 'approve') {
      const ok = window.confirm(
        `Approve ${ids.length} submission${ids.length === 1 ? '' : 's'}? ` +
          `Approved items are published publicly.`,
      )
      if (!ok) return
    }

    const reason = action === 'reject' ? rejectReason.trim() : ''
    const chunks = chunk(ids, CHUNK_SIZE)
    const verb = action === 'approve' ? 'Approving' : 'Rejecting'
    const verbPast = action === 'approve' ? 'Approved' : 'Rejected'

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
        const res = await fetch('/api/admin/submissions/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: chunks[i],
            action,
            ...(reason ? { reason } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
        updated += data.updated ?? 0
      }
      setToast({ kind: 'success', msg: `${verbPast} ${updated} submission${updated === 1 ? '' : 's'}.` })
      clearSelection()
      setRejectReason('')
      await fetchSubmissions()
    } catch (err) {
      setToast({
        kind: 'error',
        msg: `Failed after ${updated} updated — ${err instanceof Error ? err.message : 'unknown error'}`,
      })
    } finally {
      setActionRunning(false)
    }
  }

  const selectedCount = selectedIds.size
  const hasMoreThanPage = total > submissions.length

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-28">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Submissions
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} {total === 1 ? 'submission' : 'submissions'} in {statusFilter || 'all states'}
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
              href="/admin/submissions/new"
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Add submission
            </Link>
          </div>
        </header>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <input
            type="search"
            placeholder="Search title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
          <input
            type="search"
            placeholder="Search artist…"
            value={artistSearch}
            onChange={(e) => setArtistSearch(e.target.value)}
            className={inputCls}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="deferred">Deferred</option>
            <option value="needs_work">Needs work</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
            <option value="">All types</option>
            <option value="single">Single (track)</option>
            <option value="release">Release (EP/Album)</option>
            <option value="mix">Mix</option>
            <option value="dj_set">DJ Set</option>
            <option value="playlist">Playlist</option>
            <option value="video">Video</option>
            <option value="podcast">Podcast</option>
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={inputCls}>
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'created_at' | 'release_date')}
              className={`${inputCls} flex-1`}
            >
              <option value="created_at">Sort: Date added</option>
              <option value="release_date">Sort: Release date</option>
            </select>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`text-xs uppercase tracking-wider px-3 py-2 rounded-l-[var(--radius)] transition-colors ${
                  view === 'list'
                    ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]'
                    : 'bg-[var(--color-bg-input)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView('card')}
                className={`text-xs uppercase tracking-wider px-3 py-2 rounded-r-[var(--radius)] transition-colors ${
                  view === 'card'
                    ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]'
                    : 'bg-[var(--color-bg-input)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                }`}
              >
                Cards
              </button>
            </div>
          </div>
        </div>

        {/* Selection toolbar */}
        {!loading && submissions.length > 0 && (
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
        )}

        {/* Select-all-matching banner */}
        {!loading && submissions.length > 0 && allVisibleSelected && hasMoreThanPage && (
          <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-[var(--radius)] px-4 py-2.5 mb-3 text-sm flex items-center gap-3 flex-wrap">
            {selectedCount >= total ? (
              <span className="text-[var(--color-fg-secondary)]">
                All <strong className="text-[var(--color-fg-primary)]">{total}</strong> matching submissions are selected.
                {allMatchingCapped && (
                  <span className="text-[var(--color-warning)]"> (capped at {selectedCount} — refine the filter)</span>
                )}
              </span>
            ) : (
              <>
                <span className="text-[var(--color-fg-secondary)]">
                  All {submissions.length} on this page are selected.
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

        {/* Results */}
        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : submissions.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)] mb-4">
              {total === 0 ? 'No submissions yet.' : 'No submissions match your filters.'}
            </p>
            {total === 0 && (
              <Link
                href="/admin/submissions/new"
                className="inline-block bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Add the first submission
              </Link>
            )}
          </div>
        ) : view === 'card' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {submissions.map((s) => (
              <SubmissionCard key={s.id} s={s} selected={selectedIds.has(s.id)} onToggle={() => toggleOne(s.id)} />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {submissions.map((s) => (
              <SubmissionListRow key={s.id} s={s} selected={selectedIds.has(s.id)} onToggle={() => toggleOne(s.id)} />
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={pagerCls}
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
              className={pagerCls}
            >
              Next →
            </button>
          </div>
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
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
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
            {rejectOpen ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none w-56"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => runBulk('reject')}
                  disabled={actionRunning}
                  className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-primary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-higher)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionRunning ? 'Rejecting…' : `Reject ${selectedCount}`}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(false)}
                  disabled={actionRunning}
                  className="text-sm text-[var(--color-fg-secondary)] px-2 py-2 hover:text-[var(--color-fg-primary)] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runBulk('approve')}
                  disabled={actionRunning}
                  className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionRunning ? 'Working…' : `Approve ${selectedCount}`}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  disabled={actionRunning}
                  className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Reject…
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

const pagerCls =
  'text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

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

function SubmissionThumb({ s, variant }: { s: Submission; variant: 'row' | 'card' }) {
  const src = pickImageSrc(s)
  const initials = getInitials(s.title || s.artists?.name || '')
  if (variant === 'card') {
    return (
      <div className="aspect-square bg-[var(--color-bg-higher)] flex items-center justify-center overflow-hidden">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-3xl font-semibold text-[var(--color-fg-tertiary)]">{initials}</span>
        )}
      </div>
    )
  }
  return (
    <div className="w-12 h-12 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center flex-shrink-0 overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="text-xs font-semibold text-[var(--color-fg-tertiary)]">{initials}</span>
      )}
    </div>
  )
}

function SubmissionListRow({
  s,
  selected,
  onToggle,
}: {
  s: Submission
  selected: boolean
  onToggle: () => void
}) {
  return (
    <li
      className={`bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] transition-colors ${
        selected ? 'ring-1 ring-[var(--color-accent)]' : ''
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${s.title}`}
          className="w-4 h-4 accent-[var(--color-accent)] flex-shrink-0 cursor-pointer"
        />
        <Link
          href={`/admin/submissions/${s.id}`}
          className="flex items-center gap-3 flex-1 min-w-0 rounded-[var(--radius)] hover:opacity-90"
        >
          <SubmissionThumb s={s} variant="row" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--color-fg-primary)] truncate">{s.title}</span>
              <TypeBadge type={s.type} />
              <StatusBadge status={s.status} />
              {s.priority === 'high' && (
                <span className="text-[10px] uppercase font-semibold text-[var(--color-accent)]">high</span>
              )}
            </div>
            <p className="text-xs text-[var(--color-fg-secondary)] truncate">
              {s.artists?.name || 'Unknown artist'}
            </p>
            <p className="text-[11px] text-[var(--color-fg-tertiary)] mt-0.5">
              {formatReleaseDate(s.release_date)}
              {s.source && <span> · {SOURCE_LABELS[s.source] || s.source}</span>}
            </p>
          </div>
        </Link>
        {s.source_url && !s.source_url.startsWith('manual:') && (
          <a
            href={s.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-accent)] whitespace-nowrap px-2 py-1 transition-colors"
          >
            open source ↗
          </a>
        )}
      </div>
    </li>
  )
}

function SubmissionCard({
  s,
  selected,
  onToggle,
}: {
  s: Submission
  selected: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`relative block bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] overflow-hidden transition-colors ${
        selected ? 'ring-2 ring-[var(--color-accent)]' : ''
      }`}
    >
      <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-7 h-7 rounded-[var(--radius)] bg-[var(--color-bg-base)]/70 backdrop-blur cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${s.title}`}
          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
        />
      </label>
      {s.source_url && !s.source_url.startsWith('manual:') && (
        <a
          href={s.source_url}
          target="_blank"
          rel="noreferrer"
          className="absolute top-2 right-2 z-10 text-[11px] text-[var(--color-fg-primary)] bg-[var(--color-bg-base)]/70 backdrop-blur rounded-[var(--radius)] px-2 py-1 hover:text-[var(--color-accent)] transition-colors"
        >
          ↗
        </a>
      )}
      <Link href={`/admin/submissions/${s.id}`} className="block hover:opacity-95">
        <SubmissionThumb s={s} variant="card" />
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <TypeBadge type={s.type} />
            <StatusBadge status={s.status} />
            {s.priority === 'high' && (
              <span className="text-[10px] uppercase font-semibold text-[var(--color-accent)]">high</span>
            )}
          </div>
          <h3 className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">{s.title}</h3>
          <p className="text-xs text-[var(--color-fg-secondary)] truncate">
            {s.artists?.name || 'Unknown artist'}
          </p>
          <p className="text-[11px] text-[var(--color-fg-tertiary)] mt-0.5">
            {formatReleaseDate(s.release_date)}
            {s.source && <span> · {SOURCE_LABELS[s.source] || s.source}</span>}
          </p>
        </div>
      </Link>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)] font-semibold">
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    approved: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    rejected: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
    deferred: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
    needs_work: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
  }
  const label = status === 'needs_work' ? 'needs work' : status
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${styles[status] || styles.pending}`}
    >
      {label}
    </span>
  )
}
