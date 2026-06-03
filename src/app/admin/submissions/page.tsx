'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Submission = {
  id: string
  submission_type: 'track' | 'release' | 'mix' | 'event'
  title: string
  url: string | null
  description: string | null
  cover_image_url: string | null
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

const PAGE_SIZE = 50

function isRenderableImage(url: string | null): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'card' | 'list'>('card')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (typeFilter) params.set('type', typeFilter)
    if (search) params.set('search', search)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    try {
      const res = await fetch(`/api/admin/submissions?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setSubmissions(data.submissions)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter, search, page])

  useEffect(() => {
    setPage(0)
  }, [statusFilter, typeFilter, search])

  useEffect(() => {
    const t = setTimeout(fetchSubmissions, 250)
    return () => clearTimeout(t)
  }, [fetchSubmissions])

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <input
            type="search"
            placeholder="Search title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="deferred">Deferred</option>
            <option value="needs_work">Needs work</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All types</option>
            <option value="track">Track</option>
            <option value="release">Release</option>
            <option value="mix">Mix</option>
            <option value="event">Event</option>
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView('card')}
              className={`flex-1 text-xs uppercase tracking-wider px-3 py-2 rounded-l-[var(--radius)] transition-colors ${
                view === 'card'
                  ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]'
                  : 'bg-[var(--color-bg-input)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex-1 text-xs uppercase tracking-wider px-3 py-2 rounded-r-[var(--radius)] transition-colors ${
                view === 'list'
                  ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]'
                  : 'bg-[var(--color-bg-input)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
              }`}
            >
              List
            </button>
          </div>
        </div>

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
              <SubmissionCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {submissions.map((s) => (
              <SubmissionListRow key={s.id} s={s} />
            ))}
          </ul>
        )}

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
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

function SubmissionCard({ s }: { s: Submission }) {
  const hasCover = isRenderableImage(s.cover_image_url) || isRenderableImage(s.artists?.image_url || null)
  const coverSrc = isRenderableImage(s.cover_image_url) ? s.cover_image_url : s.artists?.image_url

  return (
    <Link
      href={`/admin/submissions/${s.id}`}
      className="block bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] overflow-hidden hover:bg-[var(--color-bg-higher)] transition-colors"
    >
      <div className="aspect-square bg-[var(--color-bg-higher)] flex items-center justify-center">
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc!} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-3xl text-[var(--color-fg-tertiary)]">♪</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <TypeBadge type={s.submission_type} />
          <StatusBadge status={s.status} />
          {s.priority === 'high' && <span className="text-[10px] uppercase font-semibold text-[var(--color-accent)]">high</span>}
        </div>
        <h3 className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
          {s.title}
        </h3>
        <p className="text-xs text-[var(--color-fg-secondary)] truncate">
          {s.artists?.name || 'Unknown artist'}
        </p>
      </div>
    </Link>
  )
}

function SubmissionListRow({ s }: { s: Submission }) {
  const hasCover = isRenderableImage(s.cover_image_url) || isRenderableImage(s.artists?.image_url || null)
  const coverSrc = isRenderableImage(s.cover_image_url) ? s.cover_image_url : s.artists?.image_url

  return (
    <li>
      <Link
        href={`/admin/submissions/${s.id}`}
        className="block bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center flex-shrink-0 overflow-hidden">
            {hasCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc!} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-base text-[var(--color-fg-tertiary)]">♪</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--color-fg-primary)] truncate">{s.title}</span>
              <TypeBadge type={s.submission_type} />
              <StatusBadge status={s.status} />
              {s.priority === 'high' && <span className="text-[10px] uppercase font-semibold text-[var(--color-accent)]">high</span>}
            </div>
            <p className="text-xs text-[var(--color-fg-secondary)] truncate">
              {s.artists?.name || 'Unknown artist'}
            </p>
          </div>
        </div>
      </Link>
    </li>
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
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${styles[status] || styles.pending}`}>
      {label}
    </span>
  )
}
