'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type LiveInfo = {
  assignment_id: string
  submission_id: string
  start_at: string
  end_at: string | null
  title: string | null
  artwork_url: string | null
  cover_image_url: string | null
  artist_name: string | null
  artist_image_url: string | null
}

type Slot = {
  id: string
  slot_key: string
  display_name: string
  description: string | null
  position: number
  is_active: boolean
  live: LiveInfo | null
  upcoming_count: number
  past_count: number
}

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function formatWindow(start_at: string, end_at: string | null): string {
  const start = new Date(start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  if (!end_at) return `${start} → open-ended`
  const end = new Date(end_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return `${start} → ${end}`
}

function LiveThumbnail({ live }: { live: LiveInfo }) {
  const src = isRenderableImage(live.artwork_url)
    ? live.artwork_url
    : isRenderableImage(live.cover_image_url)
    ? live.cover_image_url
    : isRenderableImage(live.artist_image_url)
    ? live.artist_image_url
    : null

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={live.title ?? ''}
        className="w-10 h-10 rounded-[var(--radius)] object-cover flex-shrink-0"
        loading="lazy"
      />
    )
  }
  const initials = live.title
    ? live.title.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : '♪'
  return (
    <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)] flex-shrink-0">
      {initials}
    </div>
  )
}

function SlotCard({ slot }: { slot: Slot }) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-[var(--color-fg-primary)]">{slot.display_name}</h2>
        {slot.description && (
          <p className="text-xs text-[var(--color-fg-tertiary)] mt-0.5 leading-relaxed">{slot.description}</p>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-2">
          Live now
        </p>
        {slot.live ? (
          <div className="flex items-start gap-2.5">
            <LiveThumbnail live={slot.live} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-fg-primary)] truncate">
                {slot.live.title ?? '—'}
              </p>
              <p className="text-xs text-[var(--color-fg-secondary)] truncate">
                {slot.live.artist_name ?? 'Unknown artist'}
              </p>
              <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-0.5 leading-snug">
                {formatWindow(slot.live.start_at, slot.live.end_at)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)] italic">Nothing live</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-subtle)] mt-auto">
        <p className="text-xs text-[var(--color-fg-tertiary)]">
          {slot.upcoming_count} upcoming · {slot.past_count} past
        </p>
        <Link
          href={`/admin/editorial/${slot.slot_key}`}
          className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
        >
          Manage →
        </Link>
      </div>
    </div>
  )
}

export default function EditorialPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/editorial/slots')
      const data = await res.json()
      if (res.ok) {
        setSlots(data.slots)
      } else {
        setError(data.error ?? 'Failed to load slots')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Editorial
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              Manage featured content slots across the site.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            ← Back to dashboard
          </Link>
        </header>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-[var(--color-error)]">{error}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
