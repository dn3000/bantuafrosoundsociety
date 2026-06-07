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
}

type Toast = { kind: 'info' | 'success' | 'error'; msg: string }

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
  const [page, setPage] = useState(0)

  // Selection (persists across pages so "select all matching" can span the queue)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [allMatchingCapped, setAllMatchingCapped] = useState(false)

  // Batch action
  const [actionRunning, setActionRunning] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE)

  const visibleIds = artists.map((a) => a.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size
  const hasMoreThanPage = total > artists.length

  // Shared filter query string (everything except pagination) — used by both the
  // list fetch and the ids_only "select all matching" fetch so they stay in sync.
  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams()
      if (search) p.set('search', search)
      if (tierFilter) p.set('tier', tierFilter)
      if (trackedFilter) p.set('tracked', trackedFilter)
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [search, tierFilter, trackedFilter],
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

  // A fresh filter is a fresh selection context: reset to page 1 and drop selection.
  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
    setAllMatchingCapped(false)
  }, [search, tierFilter, trackedFilter])

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
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

            <ul className="space-y-2">
              {artists.map((artist) => {
                const selected = selectedIds.has(artist.id)
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
                    </div>
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
