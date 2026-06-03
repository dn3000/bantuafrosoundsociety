'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Submission = {
  id: string
  submission_type: 'track' | 'release' | 'mix' | 'event'
  title: string
  url: string | null
  description: string | null
  cover_image_url: string | null
  notes: string | null
  status: 'pending' | 'approved' | 'rejected' | 'deferred' | 'needs_work'
  priority: 'low' | 'normal' | 'high'
  source_method: string | null
  created_at: string
  updated_at: string
  reviewed_at: string | null
  artists: {
    id: string
    name: string
    slug: string
    image_url: string | null
  } | null
}

function extractSpotifyEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/)
  if (!m) return null
  return `https://open.spotify.com/embed/${m[1]}/${m[2]}`
}

function isRenderableImage(url: string | null): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setSubmission(data.submission)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function updateStatus(newStatus: Submission['status'], label: string) {
    setActionStatus(`${label}…`)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSubmission(data.submission)
      setActionStatus(`${label} ✓`)
      setTimeout(() => setActionStatus(null), 1500)
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
      setTimeout(() => setActionStatus(null), 3000)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this submission permanently?')) return
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) router.push('/admin/submissions')
      else {
        const data = await res.json()
        setError(data.error || 'Delete failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        </div>
      </div>
    )
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-[var(--color-error)]">{error || 'Submission not found'}</p>
          <Link href="/admin/submissions" className="text-sm text-[var(--color-accent)] hover:underline mt-4 inline-block">
            ← Back to submissions
          </Link>
        </div>
      </div>
    )
  }

  const embedUrl = extractSpotifyEmbedUrl(submission.url)
  const hasCover = isRenderableImage(submission.cover_image_url) || isRenderableImage(submission.artists?.image_url || null)
  const coverSrc = isRenderableImage(submission.cover_image_url)
    ? submission.cover_image_url
    : submission.artists?.image_url

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/admin/submissions"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            ← Back to submissions
          </Link>
        </div>

        {/* Hero */}
        <div className="flex items-start gap-5 mb-6 flex-wrap sm:flex-nowrap">
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc!}
              alt={submission.title}
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-[var(--radius-md)] object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-[var(--radius-md)] bg-[var(--color-bg-higher)] flex items-center justify-center text-3xl text-[var(--color-fg-tertiary)] flex-shrink-0">
              ♪
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)] mb-1">
              {submission.title}
            </h1>
            {submission.artists && (
              <Link
                href={`/admin/artists/${submission.artists.slug}`}
                className="text-base text-[var(--color-accent)] hover:underline"
              >
                {submission.artists.name}
              </Link>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]">
                {submission.submission_type}
              </span>
              <span
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
                  submission.status === 'approved'
                    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]'
                }`}
              >
                {submission.status === 'needs_work' ? 'needs work' : submission.status}
              </span>
              {submission.priority === 'high' && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)]">
                  high priority
                </span>
              )}
            </div>
            {submission.description && (
              <p className="text-sm text-[var(--color-fg-secondary)] leading-relaxed mt-3">
                {submission.description}
              </p>
            )}
          </div>
        </div>

        {/* Spotify embed */}
        {embedUrl && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-2 mb-6">
            <iframe
              src={embedUrl}
              width="100%"
              height="80"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="rounded-[var(--radius)]"
              title={`Spotify preview: ${submission.title}`}
            ></iframe>
          </div>
        )}

        {/* External link */}
        {submission.url && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 mb-6">
            <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-1">URL</p>
            <a
              href={submission.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--color-accent)] hover:underline break-all"
            >
              {submission.url}
            </a>
          </div>
        )}

        {/* Status actions */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Status actions
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionButton
              variant="accent"
              disabled={submission.status === 'approved'}
              onClick={() => updateStatus('approved', 'Approved')}
            >
              ✓ Approve
            </ActionButton>
            <ActionButton
              variant="neutral"
              disabled={submission.status === 'deferred'}
              onClick={() => updateStatus('deferred', 'Deferred')}
            >
              Defer
            </ActionButton>
            <ActionButton
              variant="neutral"
              disabled={submission.status === 'needs_work'}
              onClick={() => updateStatus('needs_work', 'Marked needs work')}
            >
              Needs work
            </ActionButton>
            <ActionButton
              variant="neutral"
              disabled={submission.status === 'rejected'}
              onClick={() => updateStatus('rejected', 'Rejected')}
            >
              ✕ Reject
            </ActionButton>
            <ActionButton
              variant="neutral"
              disabled={submission.status === 'pending'}
              onClick={() => updateStatus('pending', 'Reopened')}
            >
              Reopen as pending
            </ActionButton>
          </div>
          {actionStatus && (
            <p className="text-xs text-[var(--color-fg-secondary)] mt-3">{actionStatus}</p>
          )}
        </div>

        {/* Meta */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Meta
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-0.5">Created</p>
              <p className="text-[var(--color-fg-primary)]">
                {new Date(submission.created_at).toLocaleDateString('en-GB')}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-0.5">Reviewed</p>
              <p className="text-[var(--color-fg-primary)]">
                {submission.reviewed_at ? new Date(submission.reviewed_at).toLocaleDateString('en-GB') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-0.5">Source</p>
              <p className="text-[var(--color-fg-primary)]">{submission.source_method || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-0.5">Priority</p>
              <p className="text-[var(--color-fg-primary)]">{submission.priority}</p>
            </div>
          </div>
          {submission.notes && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-[var(--color-fg-secondary)] whitespace-pre-wrap">{submission.notes}</p>
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="mt-8 text-right">
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-error)] transition-colors"
          >
            Delete submission
          </button>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: 'accent' | 'neutral'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const styles = variant === 'accent'
    ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)]'
    : 'text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-sm font-semibold rounded-[var(--radius)] px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${styles}`}
    >
      {children}
    </button>
  )
}
