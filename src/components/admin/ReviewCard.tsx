'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  type QueueItem,
  type QueueStatus,
  initialsFor,
  pickImage,
  sourceMethodLabel,
  typeLabel,
} from '@/lib/queue'

// Shared review card for the unified queue. ONE renderer for submissions AND
// videos. Legacy SubmissionCard / VideoRow are intentionally left untouched.
//
// Thumbnail fallback chain: resolved thumbnail_url (artwork → cover for
// submissions, thumbnail for videos — done in the endpoint) → artist image →
// initials.

const STATUS_STYLES: Record<QueueStatus, string> = {
  pending: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
  approved: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
  rejected: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  deferred: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  needs_work: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
}

function statusLabel(s: QueueStatus): string {
  return s === 'needs_work' ? 'needs work' : s
}

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ReviewCard({
  item,
  selected,
  onToggleSelect,
  actions,
}: {
  item: QueueItem
  selected?: boolean
  onToggleSelect?: () => void
  actions?: ReactNode
}) {
  const thumb = pickImage(item.thumbnail_url, item.primary_artist?.image_url)
  const initials = initialsFor(item.title || item.primary_artist?.name || '')
  const releaseDate = formatDate((item.payload?.release_date as string) ?? null)
  const addedDate = formatDate(item.created_at)
  const isExclusive = item.source === 'video' && item.payload?.is_exclusive === true

  return (
    <li
      className={`bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] transition-colors motion-reduce:transition-none ${
        selected ? 'ring-1 ring-[var(--color-accent)]' : ''
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            aria-label={`Select ${item.title}`}
            className="mt-1 w-4 h-4 accent-[var(--color-accent)] flex-shrink-0 cursor-pointer"
          />
        )}

        {/* Thumbnail */}
        <div className="w-14 h-14 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-xs font-semibold text-[var(--color-fg-tertiary)]">{initials}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--color-fg-primary)] truncate max-w-full">{item.title}</span>
            <SourcePill source={item.source} />
            <Badge>{typeLabel(item.type)}</Badge>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${STATUS_STYLES[item.status]}`}
            >
              {statusLabel(item.status)}
            </span>
            {isExclusive && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-accent)]">
                exclusive
              </span>
            )}
            {item.payload?.priority === 'high' && (
              <span className="text-[10px] uppercase font-semibold text-[var(--color-accent)]">high</span>
            )}
          </div>

          {item.primary_artist ? (
            <Link
              href={`/admin/artists/${item.primary_artist.slug}`}
              className="text-xs text-[var(--color-accent)] hover:underline truncate inline-block max-w-full"
            >
              {item.primary_artist.name}
            </Link>
          ) : (
            <p className="text-xs text-[var(--color-fg-secondary)]">Unknown artist</p>
          )}

          <p className="text-[11px] text-[var(--color-fg-tertiary)] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[var(--color-fg-secondary)]">{sourceMethodLabel(item.source_method)}</span>
            {addedDate && <span>· added {addedDate}</span>}
            {releaseDate && <span>· released {releaseDate}</span>}
            {item.external_url && (
              <>
                <span>·</span>
                <a
                  href={item.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-fg-secondary)] hover:text-[var(--color-accent)] transition-colors"
                >
                  open source ↗
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Footer: parent-injected actions */}
      {actions && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-3 border-t border-[var(--color-border-subtle)]">
          {actions}
        </div>
      )}
    </li>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)] font-semibold">
      {children}
    </span>
  )
}

function SourcePill({ source }: { source: 'submission' | 'video' }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
        source === 'video'
          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
          : 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]'
      }`}
    >
      {source}
    </span>
  )
}
