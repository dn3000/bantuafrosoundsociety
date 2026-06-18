'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReviewCard } from '@/components/admin/ReviewCard'
import {
  ALL_SOURCE_METHODS,
  SUBMISSION_TYPES,
  VIDEO_CATEGORIES,
  typeLabel,
  type QueueItem,
} from '@/lib/queue'

type StatusTab = 'pending' | 'deferred' | 'needs_work' | 'all'
type Counts = { pending_submissions: number; pending_videos: number; deferred: number; needs_work: number }
type Toast = { kind: 'success' | 'error' | 'info'; msg: string }
type Artist = { id: string; name: string; slug: string }

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'deferred', label: 'Deferred' },
  { key: 'needs_work', label: 'Needs work' },
  { key: 'all', label: 'All' },
]

const PAGE_SIZE = 50
const keyOf = (it: QueueItem) => `${it.source}:${it.id}`

export function QueueClient() {
  const [tab, setTab] = useState<StatusTab>('pending')
  const [items, setItems] = useState<QueueItem[]>([])
  const [counts, setCounts] = useState<Counts>({ pending_submissions: 0, pending_videos: 0, deferred: 0, needs_work: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // Cancels an in-flight "Load more" request if the component unmounts mid-fetch.
  const loadMoreCtrlRef = useRef<AbortController | null>(null)

  // Filters
  const [methods, setMethods] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [artist, setArtist] = useState<Artist | null>(null)
  const [search, setSearch] = useState('')

  // Artist quick-search
  const [artistQuery, setArtistQuery] = useState('')
  const [artistResults, setArtistResults] = useState<Artist[]>([])
  const [artistMenuOpen, setArtistMenuOpen] = useState(false)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Action machinery
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ kind: 'single'; item: QueueItem } | { kind: 'bulk' } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [heroTarget, setHeroTarget] = useState<QueueItem | null>(null)
  const [heroKicker, setHeroKicker] = useState('')
  const [heroHeadline, setHeroHeadline] = useState('')
  const [promoteMenu, setPromoteMenu] = useState<string | null>(null)

  const filterSig = JSON.stringify({ tab, methods, types, artistId: artist?.id ?? null, search })

  const buildParams = useCallback(
    (cursor?: string | null) => {
      const p = new URLSearchParams()
      p.set('status', tab)
      if (methods.length) p.set('source_method', methods.join(','))
      if (types.length) p.set('type', types.join(','))
      if (artist) p.set('artist_id', artist.id)
      if (search.trim()) p.set('q', search.trim())
      p.set('limit', String(PAGE_SIZE))
      if (cursor) p.set('cursor', cursor)
      return p.toString()
    },
    [tab, methods, types, artist, search],
  )

  const fetchQueue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/queue?${buildParams()}`, { signal })
      const data = await res.json()
      if (signal?.aborted) return
      if (res.ok) {
        setItems(data.items ?? [])
        setCounts(data.counts ?? { pending_submissions: 0, pending_videos: 0, deferred: 0, needs_work: 0 })
        setNextCursor(data.nextCursor ?? null)
      } else {
        setToast({ kind: 'error', msg: data.error || 'Failed to load queue' })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load queue' })
    } finally {
      // Skip when aborted: a newer fetch (or unmount) now owns the loading flag.
      if (!signal?.aborted) setLoading(false)
    }
  }, [buildParams])

  // Reset selection + refetch whenever the filter context changes (debounced
  // 300ms — this is also the debounce for the free-text title search, which
  // feeds filterSig). The AbortController cancels the in-flight feed request
  // when the filter changes again or the component unmounts, so rapid tab/
  // filter flips and fast typing can't pile up stale responses (or stale
  // setState) in memory. setState lives inside the timer callback by design.
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setSelected(new Set())
      void fetchQueue(ctrl.signal)
    }, 300)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const ctrl = new AbortController()
    loadMoreCtrlRef.current = ctrl
    try {
      const res = await fetch(`/api/admin/queue?${buildParams(nextCursor)}`, { signal: ctrl.signal })
      const data = await res.json()
      if (ctrl.signal.aborted) return
      if (res.ok) {
        setItems((prev) => {
          const seen = new Set(prev.map(keyOf))
          const fresh = (data.items as QueueItem[]).filter((it) => !seen.has(keyOf(it)))
          return [...prev, ...fresh]
        })
        setNextCursor(data.nextCursor ?? null)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
    } finally {
      if (!ctrl.signal.aborted) setLoadingMore(false)
    }
  }

  // Abort a pending "Load more" if we unmount before it resolves.
  useEffect(() => () => loadMoreCtrlRef.current?.abort(), [])

  // Auto-dismiss terminal toasts.
  useEffect(() => {
    if (toast && toast.kind !== 'info') {
      const t = setTimeout(() => setToast(null), 4500)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Artist quick-search (debounced 300ms). An AbortController cancels the
  // previous in-flight request on every keystroke, so typing "bur" → "burn" →
  // "burna" leaves exactly one live request instead of one per keystroke.
  useEffect(() => {
    const q = artistQuery.trim()
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (!q) {
        setArtistResults([])
        return
      }
      try {
        const res = await fetch(`/api/admin/queue/artists?q=${encodeURIComponent(q)}&limit=10`, {
          signal: ctrl.signal,
        })
        const data = await res.json()
        if (ctrl.signal.aborted) return
        if (res.ok) {
          setArtistResults(data.artists ?? [])
          setArtistMenuOpen(true)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        /* ignore — quick-search is non-critical */
      }
    }, 300)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [artistQuery])

  // ----- count bookkeeping -----
  function bucketOf(it: QueueItem): keyof Counts | null {
    if (it.status === 'pending') return it.source === 'video' ? 'pending_videos' : 'pending_submissions'
    if (it.status === 'deferred') return 'deferred'
    if (it.status === 'needs_work') return 'needs_work'
    return null
  }
  function decrementBucket(it: QueueItem) {
    const b = bucketOf(it)
    if (!b) return
    setCounts((c) => ({ ...c, [b]: Math.max(0, c[b] - 1) }))
  }

  // ----- selection -----
  function toggleSelect(it: QueueItem) {
    const k = keyOf(it)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const allVisibleSelected = items.length > 0 && items.every((it) => selected.has(keyOf(it)))
  function toggleSelectAll() {
    setSelected(() => (allVisibleSelected ? new Set() : new Set(items.map(keyOf))))
  }
  const selectedItems = useMemo(() => items.filter((it) => selected.has(keyOf(it))), [items, selected])
  const selectedSubmissions = selectedItems.filter((it) => it.source === 'submission')

  // ----- single-item actions (optimistic) -----
  async function runSingle(item: QueueItem, action: 'approve' | 'reject' | 'defer' | 'needs_work', reason?: string) {
    if (busy) return
    const k = keyOf(item)
    const idx = items.findIndex((it) => keyOf(it) === k)
    // Optimistic remove
    setItems((prev) => prev.filter((it) => keyOf(it) !== k))
    decrementBucket(item)
    setSelected((prev) => {
      const n = new Set(prev)
      n.delete(k)
      return n
    })
    try {
      const res = await fetch('/api/admin/queue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, items: [{ id: item.id, source: item.source }], ...(reason ? { reason } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      const skipped = (data.skipped ?? []) as { id: string; reason: string }[]
      if (skipped.length) {
        // e.g. defer/needs_work on a video → restore + explain.
        setItems((prev) => insertAt(prev, idx, item))
        setCounts((c) => {
          const b = bucketOf(item)
          return b ? { ...c, [b]: c[b] + 1 } : c
        })
        setToast({ kind: 'error', msg: skipped[0].reason })
        return
      }
      setToast({ kind: 'success', msg: `${labelFor(action)} "${item.title}"` })
    } catch (err) {
      // Rollback
      setItems((prev) => insertAt(prev, idx, item))
      setCounts((c) => {
        const b = bucketOf(item)
        return b ? { ...c, [b]: c[b] + 1 } : c
      })
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Action failed' })
    }
  }

  async function promoteThisWeek(item: QueueItem) {
    if (busy || item.source !== 'submission') return
    setPromoteMenu(null)
    const k = keyOf(item)
    const idx = items.findIndex((it) => keyOf(it) === k)
    setItems((prev) => prev.filter((it) => keyOf(it) !== k))
    decrementBucket(item)
    try {
      const res = await fetch('/api/admin/queue/promote/this-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: item.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Promotion failed')
      setToast({ kind: 'success', msg: `Approved + added "${item.title}" to This Week` })
    } catch (err) {
      setItems((prev) => insertAt(prev, idx, item))
      setCounts((c) => {
        const b = bucketOf(item)
        return b ? { ...c, [b]: c[b] + 1 } : c
      })
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Promotion failed' })
    }
  }

  async function confirmHero() {
    if (!heroTarget || busy) return
    const item = heroTarget
    setBusy(true)
    const k = keyOf(item)
    try {
      const res = await fetch('/api/admin/queue/promote/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, source: item.source, kicker: heroKicker, headline: heroHeadline }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Promotion failed')
      setItems((prev) => prev.filter((it) => keyOf(it) !== k))
      decrementBucket(item)
      setToast({ kind: 'success', msg: `Approved + added "${item.title}" to Hero (unpublished)` })
      setHeroTarget(null)
      setHeroKicker('')
      setHeroHeadline('')
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Promotion failed' })
    } finally {
      setBusy(false)
    }
  }

  // ----- bulk actions -----
  async function runBulk(action: 'approve' | 'reject', reason?: string) {
    if (busy || selectedItems.length === 0) return
    setBusy(true)
    const batch = selectedItems
    setToast({ kind: 'info', msg: `${labelFor(action)} ${batch.length}…` })
    try {
      const res = await fetch('/api/admin/queue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, items: batch.map((it) => ({ id: it.id, source: it.source })), ...(reason ? { reason } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk action failed')
      const updated = (data.updated?.submissions ?? 0) + (data.updated?.videos ?? 0)
      const skipped = (data.skipped ?? []) as { id: string; reason: string }[]
      setToast({
        kind: 'success',
        msg: `${labelFor(action)} ${updated}${skipped.length ? ` · ${skipped.length} skipped` : ''}`,
      })
      setSelected(new Set())
      await fetchQueue()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Bulk action failed' })
    } finally {
      setBusy(false)
    }
  }

  async function bulkPromoteThisWeek() {
    if (busy || selectedSubmissions.length === 0) return
    setBusy(true)
    const batch = selectedSubmissions
    let ok = 0
    let failed = 0
    setToast({ kind: 'info', msg: `Promoting ${batch.length} to This Week…` })
    for (const item of batch) {
      try {
        const res = await fetch('/api/admin/queue/promote/this-week', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: item.id }),
        })
        if (!res.ok) {
          failed++
          continue
        }
        ok++
      } catch {
        failed++
      }
    }
    setToast({ kind: failed ? 'error' : 'success', msg: `Promoted ${ok} to This Week${failed ? ` · ${failed} failed` : ''}` })
    setSelected(new Set())
    setBusy(false)
    await fetchQueue()
  }

  function submitReject() {
    const reason = rejectReason.trim()
    if (rejectTarget?.kind === 'single') {
      void runSingle(rejectTarget.item, 'reject', reason)
    } else if (rejectTarget?.kind === 'bulk') {
      void runBulk('reject', reason)
    }
    setRejectTarget(null)
    setRejectReason('')
  }

  const totalPending = counts.pending_submissions + counts.pending_videos
  const tabCount: Record<StatusTab, number | null> = {
    pending: totalPending,
    deferred: counts.deferred,
    needs_work: counts.needs_work,
    all: null,
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-28">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">Review queue</h1>
          <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
            <strong className="text-[var(--color-fg-primary)]">{totalPending}</strong> pending —{' '}
            {counts.pending_submissions} submission{counts.pending_submissions === 1 ? '' : 's'} ·{' '}
            {counts.pending_videos} video{counts.pending_videos === 1 ? '' : 's'}
          </p>
        </header>

        {/* Status tabs */}
        <div className="flex gap-0.5 mb-4 border-b border-[var(--color-border-subtle)] flex-wrap">
          {TABS.map((t) => {
            const isActive = tab === t.key
            const count = tabCount[t.key]
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm rounded-t-[var(--radius)] transition-colors motion-reduce:transition-none border-b-2 -mb-px ${
                  isActive
                    ? 'border-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold'
                    : 'border-transparent text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                }`}
              >
                {t.label}
                {count !== null && (
                  <span
                    className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-[var(--color-fg-secondary)]' : 'text-[var(--color-fg-tertiary)]'}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-4">
          {/* Provenance (source_method) — first-class */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mr-1">
              Source
            </span>
            {ALL_SOURCE_METHODS.map((m) => (
              <Chip key={m.value} active={methods.includes(m.value)} onClick={() => toggleIn(setMethods, m.value)}>
                {m.label}
              </Chip>
            ))}
          </div>

          {/* Type / category */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mr-1">
              Type
            </span>
            {SUBMISSION_TYPES.map((t) => (
              <Chip key={`s-${t}`} active={types.includes(t)} onClick={() => toggleIn(setTypes, t)}>
                {typeLabel(t)}
              </Chip>
            ))}
            <span className="text-[var(--color-fg-tertiary)] text-xs px-1">|</span>
            {VIDEO_CATEGORIES.filter((c) => !(SUBMISSION_TYPES as readonly string[]).includes(c)).map((c) => (
              <Chip key={`v-${c}`} active={types.includes(c)} onClick={() => toggleIn(setTypes, c)}>
                {typeLabel(c)}
              </Chip>
            ))}
          </div>

          {/* Artist + search + clear */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              {artist ? (
                <span className="flex items-center gap-2 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)]">
                  {artist.name}
                  <button
                    type="button"
                    onClick={() => {
                      setArtist(null)
                      setArtistQuery('')
                    }}
                    className="text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)]"
                    aria-label="Clear artist filter"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder="Filter by artist…"
                    value={artistQuery}
                    onChange={(e) => setArtistQuery(e.target.value)}
                    onFocus={() => artistResults.length && setArtistMenuOpen(true)}
                    className={inputCls}
                  />
                  {artistMenuOpen && artistResults.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setArtistMenuOpen(false)} aria-hidden />
                      <ul className="absolute z-40 mt-1 w-64 max-h-60 overflow-auto bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius)] shadow-lg py-1">
                        {artistResults.map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setArtist(a)
                                setArtistMenuOpen(false)
                                setArtistResults([])
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-higher)] hover:text-[var(--color-fg-primary)]"
                            >
                              {a.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
            <input
              type="search"
              placeholder="Search title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} flex-1 min-w-[180px]`}
            />
            {(methods.length > 0 || types.length > 0 || artist || search) && (
              <button
                type="button"
                onClick={() => {
                  setMethods([])
                  setTypes([])
                  setArtist(null)
                  setArtistQuery('')
                  setSearch('')
                }}
                className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Select-all toolbar */}
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-[var(--color-fg-tertiary)] mb-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer text-[var(--color-fg-secondary)]">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                aria-label="Select all loaded"
              />
              Select all loaded
            </label>
            <span>· {items.length} loaded</span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)]">Nothing to review in this view.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ReviewCard
                key={keyOf(item)}
                item={item}
                selected={selected.has(keyOf(item))}
                onToggleSelect={() => toggleSelect(item)}
                actions={
                  <CardActions
                    item={item}
                    busy={busy}
                    promoteOpen={promoteMenu === keyOf(item)}
                    onTogglePromote={() => setPromoteMenu((cur) => (cur === keyOf(item) ? null : keyOf(item)))}
                    onApprove={() => runSingle(item, 'approve')}
                    onReject={() => setRejectTarget({ kind: 'single', item })}
                    onDefer={() => runSingle(item, 'defer')}
                    onNeedsWork={() => runSingle(item, 'needs_work')}
                    onPromoteThisWeek={() => promoteThisWeek(item)}
                    onPromoteHero={() => {
                      setPromoteMenu(null)
                      setHeroTarget(item)
                    }}
                  />
                }
              />
            ))}
          </ul>
        )}

        {nextCursor && !loading && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-5 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
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

      {/* Sticky bulk bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-[var(--color-fg-primary)]">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Clear
            </button>
            <div className="flex-1" />
            <button type="button" onClick={() => runBulk('approve')} disabled={busy} className={btnAccent}>
              {busy ? 'Working…' : `Approve ${selected.size}`}
            </button>
            <button type="button" onClick={() => setRejectTarget({ kind: 'bulk' })} disabled={busy} className={btnNeutral}>
              Reject…
            </button>
            <button
              type="button"
              onClick={bulkPromoteThisWeek}
              disabled={busy || selectedSubmissions.length === 0}
              className={btnNeutral}
              title={selectedSubmissions.length === 0 ? 'This Week accepts submissions only' : undefined}
            >
              → This Week ({selectedSubmissions.length})
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <Modal onClose={() => setRejectTarget(null)}>
          <h3 className="text-base font-semibold text-[var(--color-fg-primary)] mb-1">
            {rejectTarget.kind === 'bulk' ? `Reject ${selected.size} item${selected.size === 1 ? '' : 's'}` : 'Reject item'}
          </h3>
          <p className="text-xs text-[var(--color-fg-tertiary)] mb-3">An optional reason is stored on submissions.</p>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            autoFocus
            className={inputCls}
          />
          <div className="flex items-center justify-end gap-2 mt-4">
            <button type="button" onClick={() => setRejectTarget(null)} className={btnGhost}>
              Cancel
            </button>
            <button type="button" onClick={submitReject} className={btnNeutral}>
              Reject
            </button>
          </div>
        </Modal>
      )}

      {/* Hero promote modal */}
      {heroTarget && (
        <Modal onClose={() => (busy ? null : setHeroTarget(null))}>
          <h3 className="text-base font-semibold text-[var(--color-fg-primary)] mb-1">Approve + promote to Hero</h3>
          <p className="text-xs text-[var(--color-fg-tertiary)] mb-3 truncate">
            {heroTarget.title} · added unpublished — publish on /admin/hero.
          </p>
          <label className="block text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-1">Kicker</label>
          <input type="text" value={heroKicker} onChange={(e) => setHeroKicker(e.target.value)} placeholder="e.g. New release" className={`${inputCls} mb-3`} />
          <label className="block text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-1">Headline</label>
          <input type="text" value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} placeholder="Headline shown on the hero" className={inputCls} />
          <div className="flex items-center justify-end gap-2 mt-4">
            <button type="button" onClick={() => setHeroTarget(null)} disabled={busy} className={btnGhost}>
              Cancel
            </button>
            <button type="button" onClick={confirmHero} disabled={busy} className={btnAccent}>
              {busy ? 'Promoting…' : 'Approve + add to Hero'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CardActions({
  item,
  busy,
  promoteOpen,
  onTogglePromote,
  onApprove,
  onReject,
  onDefer,
  onNeedsWork,
  onPromoteThisWeek,
  onPromoteHero,
}: {
  item: QueueItem
  busy: boolean
  promoteOpen: boolean
  onTogglePromote: () => void
  onApprove: () => void
  onReject: () => void
  onDefer: () => void
  onNeedsWork: () => void
  onPromoteThisWeek: () => void
  onPromoteHero: () => void
}) {
  const isSubmission = item.source === 'submission'
  return (
    <>
      <button type="button" onClick={onApprove} disabled={busy} className={btnAccentSm}>
        Approve
      </button>
      <button type="button" onClick={onReject} disabled={busy} className={btnNeutralSm}>
        Reject
      </button>
      {isSubmission && (
        <>
          <button type="button" onClick={onDefer} disabled={busy} className={btnNeutralSm}>
            Defer
          </button>
          <button type="button" onClick={onNeedsWork} disabled={busy} className={btnNeutralSm}>
            Needs work
          </button>
        </>
      )}
      <div className="relative">
        <button type="button" onClick={onTogglePromote} disabled={busy} className={btnNeutralSm}>
          Promote ▾
        </button>
        {promoteOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={onTogglePromote} aria-hidden />
            <div className="absolute z-40 bottom-full mb-1 left-0 w-44 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius)] shadow-lg py-1">
              {isSubmission && (
                <button
                  type="button"
                  onClick={onPromoteThisWeek}
                  className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-higher)] hover:text-[var(--color-fg-primary)]"
                >
                  → This Week
                </button>
              )}
              <button
                type="button"
                onClick={onPromoteHero}
                className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-higher)] hover:text-[var(--color-fg-primary)]"
              >
                → Hero
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors motion-reduce:transition-none ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
          : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)]'
      }`}
    >
      {children}
    </button>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] p-5 shadow-xl"
      >
        {children}
      </div>
    </div>
  )
}

function insertAt(arr: QueueItem[], idx: number, item: QueueItem): QueueItem[] {
  const i = idx < 0 ? arr.length : Math.min(idx, arr.length)
  return [...arr.slice(0, i), item, ...arr.slice(i)]
}

function toggleIn(setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) {
  setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
}

const ACTION_LABELS: Record<'approve' | 'reject' | 'defer' | 'needs_work', string> = {
  approve: 'Approved',
  reject: 'Rejected',
  defer: 'Deferred',
  needs_work: 'Marked needs work',
}
function labelFor(action: 'approve' | 'reject' | 'defer' | 'needs_work'): string {
  return ACTION_LABELS[action]
}

const inputCls =
  'bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const btnAccent =
  'text-sm font-semibold rounded-[var(--radius)] px-4 py-2 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const btnNeutral =
  'text-sm font-semibold rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
const btnGhost =
  'text-sm text-[var(--color-fg-secondary)] px-3 py-2 hover:text-[var(--color-fg-primary)] disabled:opacity-50 transition-colors'
const btnAccentSm =
  'text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors'
const btnNeutralSm =
  'text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 transition-colors'
