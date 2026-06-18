'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PasteLinkSection } from './_components/PasteLinkSection'
import { PicksSection } from './_components/PicksSection'
import { applicableRails, RAIL_LABELS, type RailKey } from './_components/rails'

type VideoStatus = 'pending' | 'approved' | 'rejected'
type StatusFilter = VideoStatus | 'all'
type View = 'library' | 'featured'

type Video = {
  id: string
  youtube_video_id: string
  title: string
  category: string
  published_at: string | null
  thumbnail_url: string | null
  status: VideoStatus
  is_exclusive: boolean
  created_at: string
  artists: {
    id: string
    name: string
    slug: string
  } | null
}

const CATEGORIES = ['mix', 'live_set', 'live_show', 'music_video', 'interview', 'other'] as const
// Labels here are the admin's view only — they hint which homepage row each
// category feeds. The DB enum values stay mix / live_set / live_show /
// music_video / interview / other. Public-facing labels live in VideoCarousel.
const CATEGORY_LABELS: Record<string, string> = {
  mix: 'Mix',
  live_set: 'Live Set',
  live_show: 'Live Show / BASS Set',
  music_video: 'Music Video',
  interview: 'Interview / Podcast',
  other: 'Other',
}

const STATUS_LABELS: Record<VideoStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

const PAGE_SIZE = 50

const pagerCls =
  'text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

export default function VideosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [view, setView] = useState<View>('library')
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('pending')
  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<VideoStatus, number>>({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [actioning, setActioning] = useState<Set<string>>(new Set())
  const [rejectingAll, setRejectingAll] = useState(false)
  const [pinnedMap, setPinnedMap] = useState<Record<string, RailKey[]>>({})
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const fetchCounts = useCallback(async () => {
    const statuses: VideoStatus[] = ['pending', 'approved', 'rejected']
    const results = await Promise.all(
      statuses.map((s) =>
        supabase.from('videos').select('*', { count: 'exact', head: true }).eq('status', s),
      ),
    )
    const next = { pending: 0, approved: 0, rejected: 0 } as Record<VideoStatus, number>
    results.forEach(({ count }, i) => {
      next[statuses[i]] = count ?? 0
    })
    setCounts(next)
  }, [supabase])

  // video_id → rails it is pinned to, so rows can show a "Pinned" indicator and
  // the Pin menu can disable rails already taken.
  const fetchPinned = useCallback(async () => {
    const { data } = await supabase.from('video_picks').select('video_id, rail_key')
    const map: Record<string, RailKey[]> = {}
    for (const row of (data ?? []) as { video_id: string; rail_key: RailKey }[]) {
      ;(map[row.video_id] ??= []).push(row.rail_key)
    }
    setPinnedMap(map)
  }, [supabase])

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('videos')
        .select(
          'id, youtube_video_id, title, category, published_at, thumbnail_url, status, is_exclusive, created_at, artists(id, name, slug)',
          { count: 'exact' },
        )

      if (activeFilter !== 'all') {
        query = query.eq('status', activeFilter)
      }

      const { data, error, count } = await query
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) throw error
      setVideos((data ?? []) as unknown as Video[])
      setTotal(count ?? 0)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load videos' })
    } finally {
      setLoading(false)
    }
  }, [supabase, page, activeFilter])

  // Defer each fetch into a timer so the effect body itself never triggers a
  // synchronous setState (lint: react-hooks/set-state-in-effect) — same pattern
  // as QueueClient. The fetchers are also called directly from handlers.
  useEffect(() => {
    const t = setTimeout(() => void fetchVideos(), 0)
    return () => clearTimeout(t)
  }, [fetchVideos])

  useEffect(() => {
    const t = setTimeout(() => void fetchCounts(), 0)
    return () => clearTimeout(t)
  }, [fetchCounts])

  useEffect(() => {
    const t = setTimeout(() => void fetchPinned(), 0)
    return () => clearTimeout(t)
  }, [fetchPinned])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  function handleFilterChange(f: StatusFilter) {
    setActiveFilter(f)
    setPage(0)
  }

  function startActioning(id: string) {
    setActioning((prev) => new Set(prev).add(id))
  }

  function stopActioning(id: string) {
    setActioning((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function patchVideo(
    id: string,
    updates: { category?: string; status?: VideoStatus; is_exclusive?: boolean },
  ) {
    const res = await fetch(`/api/admin/videos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { error?: string }).error ?? 'Update failed')
    }
  }

  async function handleCategoryChange(video: Video, newCategory: string) {
    if (actioning.has(video.id)) return
    const prevCategory = video.category
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, category: newCategory } : v)))
    startActioning(video.id)
    try {
      await patchVideo(video.id, { category: newCategory })
    } catch (err) {
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, category: prevCategory } : v)))
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to save category' })
    } finally {
      stopActioning(video.id)
    }
  }

  async function handleExclusiveToggle(video: Video) {
    if (actioning.has(video.id)) return
    const next = !video.is_exclusive
    setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, is_exclusive: next } : v)))
    startActioning(video.id)
    try {
      await patchVideo(video.id, { is_exclusive: next })
    } catch (err) {
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, is_exclusive: !next } : v)),
      )
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to save exclusive' })
    } finally {
      stopActioning(video.id)
    }
  }

  async function handleStatusChange(video: Video, newStatus: VideoStatus) {
    if (actioning.has(video.id)) return
    startActioning(video.id)
    try {
      await patchVideo(video.id, { status: newStatus })
      if (activeFilter !== 'all' && activeFilter !== newStatus) {
        setVideos((prev) => prev.filter((v) => v.id !== video.id))
        setTotal((t) => t - 1)
      } else {
        setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, status: newStatus } : v)))
      }
      setToast({ kind: 'success', msg: `"${video.title}" → ${STATUS_LABELS[newStatus]}` })
      fetchCounts()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to update status' })
    } finally {
      stopActioning(video.id)
    }
  }

  async function handlePin(video: Video, rail: RailKey) {
    if (actioning.has(video.id)) return
    startActioning(video.id)
    try {
      const res = await fetch('/api/admin/video-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rail_key: rail, video_id: video.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ kind: 'error', msg: (data as { error?: string }).error ?? 'Pin failed' })
        return
      }
      setPinnedMap((m) => ({ ...m, [video.id]: [...(m[video.id] ?? []), rail] }))
      setToast({ kind: 'success', msg: `Pinned "${video.title}" to ${RAIL_LABELS[rail]}` })
    } catch {
      setToast({ kind: 'error', msg: 'Pin failed' })
    } finally {
      stopActioning(video.id)
    }
  }

  async function handleDelete(video: Video) {
    if (actioning.has(video.id)) return
    const ok = window.confirm(`Delete "${video.title}"? This cannot be undone.`)
    if (!ok) return
    startActioning(video.id)
    try {
      const res = await fetch(`/api/admin/videos/${video.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Delete failed')
      }
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
      setTotal((t) => t - 1)
      setToast({ kind: 'success', msg: `Deleted "${video.title}"` })
      fetchCounts()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to delete' })
    } finally {
      stopActioning(video.id)
    }
  }

  async function rejectAllOnPage() {
    if (rejectingAll || videos.length === 0) return
    const ok = window.confirm(`Reject all ${videos.length} videos on this page?`)
    if (!ok) return
    setRejectingAll(true)
    try {
      const ids = videos.map((v) => v.id)
      const { error } = await supabase.from('videos').update({ status: 'rejected' }).in('id', ids)
      if (error) throw error
      if (activeFilter !== 'all' && activeFilter !== 'rejected') {
        setVideos([])
        setTotal((t) => Math.max(0, t - ids.length))
      } else {
        setVideos((prev) => prev.map((v) => (ids.includes(v.id) ? { ...v, status: 'rejected' as VideoStatus } : v)))
      }
      setToast({ kind: 'success', msg: `Rejected ${ids.length} video${ids.length === 1 ? '' : 's'}` })
      fetchCounts()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to reject all' })
    } finally {
      setRejectingAll(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allCount = counts.pending + counts.approved + counts.rejected

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Video manager
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} {activeFilter !== 'all' ? activeFilter : ''} {total === 1 ? 'video' : 'videos'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {view === 'library' && videos.length > 0 && (
              <button
                type="button"
                onClick={rejectAllOnPage}
                disabled={rejectingAll}
                className="text-sm font-semibold text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 transition-colors"
              >
                {rejectingAll ? 'Rejecting…' : `Reject page (${videos.length})`}
              </button>
            )}
            <Link
              href="/admin/scrapers"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Ingest more →
            </Link>
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Back to admin
            </Link>
          </div>
        </header>

        {/* Paste-a-link — always available at the top */}
        <PasteLinkSection
          onSaved={() => {
            fetchVideos()
            fetchCounts()
            fetchPinned()
          }}
        />

        {/* Library / Featured view switch */}
        <div className="flex gap-2 mb-5">
          {(['library', 'featured'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`text-sm font-semibold rounded-[var(--radius)] px-4 py-1.5 border transition-colors ${
                view === v
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
              }`}
            >
              {v === 'library' ? 'Library' : 'Featured / Picks'}
            </button>
          ))}
        </div>

        {view === 'featured' ? (
          <PicksSection />
        ) : (
          <>
            {/* Status filter tabs */}
            <div className="flex gap-0.5 mb-5 border-b border-[var(--color-border-subtle)]">
              {TABS.map((tab) => {
                const count = tab.key === 'all' ? allCount : counts[tab.key]
                const isActive = activeFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleFilterChange(tab.key)}
                    className={`px-4 py-2 text-sm rounded-t-[var(--radius)] transition-colors border-b-2 -mb-px ${
                      isActive
                        ? 'border-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold'
                        : 'border-transparent text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`ml-1.5 text-xs tabular-nums ${
                        isActive ? 'text-[var(--color-fg-secondary)]' : 'text-[var(--color-fg-tertiary)]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {loading ? (
              <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
            ) : videos.length === 0 ? (
              <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
                <p className="text-[var(--color-fg-secondary)] mb-4">
                  No {activeFilter !== 'all' ? activeFilter : ''} videos.
                </p>
                {activeFilter === 'pending' && (
                  <Link
                    href="/admin/scrapers"
                    className="inline-block text-sm text-[var(--color-accent)] hover:underline"
                  >
                    Run the OAC ingestion →
                  </Link>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {videos.map((v) => (
                  <VideoRow
                    key={v.id}
                    video={v}
                    actioning={actioning.has(v.id)}
                    pinnedRails={pinnedMap[v.id] ?? []}
                    onCategoryChange={(cat) => handleCategoryChange(v, cat)}
                    onStatusChange={(s) => handleStatusChange(v, s)}
                    onExclusiveToggle={() => handleExclusiveToggle(v)}
                    onPin={(rail) => handlePin(v, rail)}
                    onApprove={() => handleStatusChange(v, 'approved')}
                    onReject={() => handleStatusChange(v, 'rejected')}
                    onDelete={() => handleDelete(v)}
                  />
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
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-4 z-50 max-w-sm rounded-[var(--radius)] px-4 py-3 text-sm shadow-lg border ${
            toast.kind === 'success'
              ? 'bg-[var(--color-bg-elevated)] border-[var(--color-success)] text-[var(--color-fg-primary)]'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-error)] text-[var(--color-fg-primary)]'
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// Per-row "Pin to…" control. Offers only the rails applicable to this video
// (derived from category + is_exclusive) and disables rails it's already on.
function PinMenu({
  video,
  pinnedRails,
  disabled,
  onPin,
}: {
  video: Video
  pinnedRails: RailKey[]
  disabled: boolean
  onPin: (rail: RailKey) => void
}) {
  const rails = applicableRails(video.category, video.is_exclusive)
  if (rails.length === 0) {
    return (
      <span className="text-[10px] text-[var(--color-fg-tertiary)] flex-shrink-0 w-16 text-center">
        No rail
      </span>
    )
  }
  const pinned = new Set(pinnedRails)
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {pinned.size > 0 && (
        <span
          title={pinnedRails.map((r) => RAIL_LABELS[r]).join(', ')}
          className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
        >
          Pinned {pinned.size}
        </span>
      )}
      <select
        value=""
        disabled={disabled}
        onChange={(e) => {
          const r = e.target.value
          if (r) onPin(r as RailKey)
        }}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1.5 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none disabled:opacity-50"
      >
        <option value="">Pin to…</option>
        {rails.map((r) => (
          <option key={r} value={r} disabled={pinned.has(r)}>
            {RAIL_LABELS[r]}
            {pinned.has(r) ? ' ✓' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function VideoRow({
  video,
  actioning,
  pinnedRails,
  onCategoryChange,
  onStatusChange,
  onExclusiveToggle,
  onPin,
  onApprove,
  onReject,
  onDelete,
}: {
  video: Video
  actioning: boolean
  pinnedRails: RailKey[]
  onCategoryChange: (cat: string) => void
  onStatusChange: (s: VideoStatus) => void
  onExclusiveToggle: () => void
  onPin: (rail: RailKey) => void
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
}) {
  return (
    <li
      id={`video-${video.id}`}
      className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 flex items-center gap-3 scroll-mt-24"
    >
      {/* 16:9 thumbnail */}
      <div className="w-24 h-[54px] flex-shrink-0 rounded-[var(--radius)] overflow-hidden bg-[var(--color-bg-higher)]">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[var(--color-fg-tertiary)] text-xs">—</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <a
          href={`https://www.youtube.com/watch?v=${video.youtube_video_id}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sm text-[var(--color-fg-primary)] hover:text-[var(--color-accent)] transition-colors block truncate"
        >
          {video.title}
        </a>
        <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
          {video.artists?.name || 'Unknown artist'}
          {video.published_at && (
            <span className="text-[var(--color-fg-tertiary)]">
              {' · '}
              {new Date(video.published_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          )}
        </p>
      </div>

      {/* Pin to homepage rail */}
      <PinMenu video={video} pinnedRails={pinnedRails} disabled={actioning} onPin={onPin} />

      {/* Exclusive toggle — pill, optimistic */}
      <button
        type="button"
        onClick={onExclusiveToggle}
        disabled={actioning}
        className={`text-xs font-semibold rounded-full px-3 py-1 border transition-colors disabled:opacity-50 flex-shrink-0 ${
          video.is_exclusive
            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'border-[var(--color-border-default)] text-[var(--color-fg-tertiary)]'
        }`}
      >
        {video.is_exclusive ? 'Exclusive' : 'Not exclusive'}
      </button>

      {/* Category — saves on change */}
      <select
        value={video.category}
        onChange={(e) => onCategoryChange(e.target.value)}
        disabled={actioning}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1.5 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors disabled:opacity-50 flex-shrink-0"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>

      {/* Status select */}
      <select
        value={video.status}
        onChange={(e) => onStatusChange(e.target.value as VideoStatus)}
        disabled={actioning}
        className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1.5 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors disabled:opacity-50 flex-shrink-0"
      >
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>

      {/* Approve / Reject / Delete */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onApprove}
          disabled={actioning || video.status === 'approved'}
          className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={actioning || video.status === 'rejected'}
          className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)] disabled:opacity-40 transition-colors"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={actioning}
          className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
