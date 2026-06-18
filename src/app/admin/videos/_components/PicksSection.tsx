'use client'

import { useCallback, useEffect, useState } from 'react'
import { RAIL_KEYS, RAIL_LABELS, type RailKey } from './rails'

type PickVideo = {
  id: string
  title: string
  thumbnail_url: string | null
  category: string
  status: string
  is_exclusive: boolean
  artists: { name: string } | null
}

type Pick = {
  id: string
  rail_key: RailKey
  video_id: string
  position: number
  video: PickVideo | null
}

export function PicksSection() {
  const [rail, setRail] = useState<RailKey>('exclusive_sets')
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/video-picks?rail_key=${rail}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load picks')
      setPicks((data.picks ?? []) as Pick[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load picks')
    } finally {
      setLoading(false)
    }
  }, [rail])

  // Deferred into a timer so the effect body doesn't setState synchronously
  // (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= picks.length || busy) return
    setBusy(true)
    const a = picks[i]
    const b = picks[j]
    try {
      await Promise.all([
        fetch('/api/admin/video-picks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: a.id, position: b.position }),
        }),
        fetch('/api/admin/video-picks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: b.id, position: a.position }),
        }),
      ])
      await load()
    } catch {
      setError('Reorder failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/video-picks?id=${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Remove failed')
      }
      setPicks((p) => p.filter((x) => x.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
        Pinned videos ride above the chronological feed for their homepage row. Use the per-video
        <span className="text-[var(--color-fg-primary)]"> “Pin to…” </span>
        action in the Library tab to add picks here.
      </p>

      {/* Rail selector */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {RAIL_KEYS.map((k) => {
          const active = rail === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setRail(k)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                active
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
              }`}
            >
              {RAIL_LABELS[k]}
            </button>
          )
        })}
      </div>

      {error && <p className="mb-3 text-xs text-[var(--color-error)]">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
      ) : picks.length === 0 ? (
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center text-sm text-[var(--color-fg-tertiary)] italic">
          No picks yet for this rail.
        </div>
      ) : (
        <ul className="space-y-2">
          {picks.map((p, i) => (
            <li
              key={p.id}
              className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 flex items-center gap-3"
            >
              <span className="w-6 text-center text-sm font-bold text-white/40 tabular-nums shrink-0">
                {i + 1}
              </span>

              <div className="w-20 h-[45px] flex-shrink-0 rounded-[var(--radius)] overflow-hidden bg-[var(--color-bg-higher)]">
                {p.video?.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.video.thumbnail_url}
                    alt={p.video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-fg-primary)] truncate">
                  {p.video?.title ?? '(missing video)'}
                </p>
                <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
                  {p.video?.artists?.name || 'Unknown artist'}
                  {p.video && p.video.status !== 'approved' && (
                    <span className="text-[var(--color-error)]">
                      {' · '}
                      {p.video.status} (won’t show on homepage)
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  aria-label="Move up"
                  className="text-xs rounded-[var(--radius)] px-2 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] disabled:opacity-30 transition-colors"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === picks.length - 1}
                  aria-label="Move down"
                  className="text-xs rounded-[var(--radius)] px-2 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] disabled:opacity-30 transition-colors"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={busy}
                  className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
