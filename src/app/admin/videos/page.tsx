'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Video = {
  id: string
  youtube_video_id: string
  title: string
  category: string
  published_at: string | null
  thumbnail_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  artists: {
    id: string
    name: string
    slug: string
  } | null
}

const CATEGORIES = ['mix', 'live_set', 'music_video', 'interview', 'other'] as const
const CATEGORY_LABELS: Record<string, string> = {
  mix: 'Mix',
  live_set: 'Live Set',
  music_video: 'Music Video',
  interview: 'Interview',
  other: 'Other',
}

const PAGE_SIZE = 50

const pagerCls =
  'text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

export default function VideosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [videos, setVideos] = useState<Video[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  // Per-row category overrides (id → chosen category). Falls back to video.category.
  const [pendingCategories, setPendingCategories] = useState<Record<string, string>>({})
  const [actioning, setActioning] = useState<Set<string>>(new Set())
  const [rejectingAll, setRejectingAll] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error, count } = await supabase
        .from('videos')
        .select(
          'id, youtube_video_id, title, category, published_at, thumbnail_url, status, created_at, artists(id, name, slug)',
          { count: 'exact' },
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error) throw error
      setVideos((data ?? []) as unknown as Video[])
      setTotal(count ?? 0)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load videos' })
    } finally {
      setLoading(false)
    }
  }, [supabase, page])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  function getCategoryFor(id: string, defaultCat: string): string {
    return pendingCategories[id] ?? defaultCat
  }

  function setCategoryFor(id: string, cat: string) {
    setPendingCategories((prev) => ({ ...prev, [id]: cat }))
  }

  async function approve(video: Video) {
    if (actioning.has(video.id)) return
    setActioning((prev) => new Set(prev).add(video.id))
    try {
      const category = getCategoryFor(video.id, video.category)
      const { error } = await supabase
        .from('videos')
        .update({ status: 'approved', category })
        .eq('id', video.id)
      if (error) throw error
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
      setTotal((t) => t - 1)
      setToast({ kind: 'success', msg: `Approved "${video.title}"` })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to approve' })
    } finally {
      setActioning((prev) => {
        const next = new Set(prev)
        next.delete(video.id)
        return next
      })
    }
  }

  async function reject(video: Video) {
    if (actioning.has(video.id)) return
    setActioning((prev) => new Set(prev).add(video.id))
    try {
      const { error } = await supabase
        .from('videos')
        .update({ status: 'rejected' })
        .eq('id', video.id)
      if (error) throw error
      setVideos((prev) => prev.filter((v) => v.id !== video.id))
      setTotal((t) => t - 1)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to reject' })
    } finally {
      setActioning((prev) => {
        const next = new Set(prev)
        next.delete(video.id)
        return next
      })
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
      setVideos([])
      setTotal((t) => Math.max(0, t - ids.length))
      setToast({ kind: 'success', msg: `Rejected ${ids.length} video${ids.length === 1 ? '' : 's'}` })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to reject all' })
    } finally {
      setRejectingAll(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Watch review
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} pending {total === 1 ? 'video' : 'videos'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {videos.length > 0 && (
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

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : videos.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)] mb-4">No pending videos.</p>
            <Link
              href="/admin/scrapers"
              className="inline-block text-sm text-[var(--color-accent)] hover:underline"
            >
              Run the OAC ingestion →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <VideoRow
                key={v.id}
                video={v}
                category={getCategoryFor(v.id, v.category)}
                onCategoryChange={(cat) => setCategoryFor(v.id, cat)}
                onApprove={() => approve(v)}
                onReject={() => reject(v)}
                actioning={actioning.has(v.id)}
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

function VideoRow({
  video,
  category,
  onCategoryChange,
  onApprove,
  onReject,
  actioning,
}: {
  video: Video
  category: string
  onCategoryChange: (cat: string) => void
  onApprove: () => void
  onReject: () => void
  actioning: boolean
}) {
  return (
    <li className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 flex items-center gap-3">
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

      {/* Category dropdown — pre-set to suggested value, editable before approve */}
      <select
        value={category}
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

      {/* Approve / Reject */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onApprove}
          disabled={actioning}
          className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={actioning}
          className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)] disabled:opacity-50 transition-colors"
        >
          Reject
        </button>
      </div>
    </li>
  )
}
