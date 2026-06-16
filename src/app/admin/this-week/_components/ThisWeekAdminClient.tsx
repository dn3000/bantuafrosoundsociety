'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type ThisWeekItem = {
  id: string
  position: number
  submission_id: string | null
  title: string
  artist_name: string | null
  artwork_url: string | null
  source_url: string | null
  release_url: string | null
  release_date: string | null
  created_at: string
  updated_at: string
}

type SubmissionCandidate = {
  id: string
  title: string
  artist_name: string | null
  artwork_url: string | null
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const labelCls =
  'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'

export function ThisWeekAdminClient() {
  const [items, setItems] = useState<ThisWeekItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/this-week')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load This Week items')
      setItems(data.items ?? [])
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/this-week')
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? 'Failed to load This Week items')
        setItems(data.items ?? [])
      } catch (err) {
        if (!cancelled) {
          setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleMove(item: ThisWeekItem, direction: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((i) => i.id === item.id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    const aPos = a.position
    const bPos = b.position
    markBusy(a.id, true)
    markBusy(b.id, true)
    try {
      // Swap positions in two PATCH calls. position has no uniqueness
      // constraint, so even if the second call fails the table stays in a
      // recoverable state (we re-fetch on error).
      const r1 = await fetch(`/api/admin/this-week/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: bPos }),
      })
      if (!r1.ok) throw new Error('Failed to move item')
      const r2 = await fetch(`/api/admin/this-week/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: aPos }),
      })
      if (!r2.ok) throw new Error('Failed to move item')
      await refresh()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Move failed' })
      await refresh()
    } finally {
      markBusy(a.id, false)
      markBusy(b.id, false)
    }
  }

  async function handleRemove(item: ThisWeekItem) {
    const ok = window.confirm(`Remove "${item.title}" from This Week?`)
    if (!ok) return
    markBusy(item.id, true)
    try {
      const res = await fetch(`/api/admin/this-week/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Remove failed')
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setToast({ kind: 'success', msg: 'Removed' })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Remove failed' })
    } finally {
      markBusy(item.id, false)
    }
  }

  function handleAdded(newItem: ThisWeekItem) {
    setItems((prev) => [...prev, newItem].sort((a, b) => a.position - b.position))
    setToast({ kind: 'success', msg: 'Added to This Week' })
  }

  const sorted = [...items].sort((a, b) => a.position - b.position)

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              ← Back to admin
            </Link>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              BASS This Week
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {sorted.length} {sorted.length === 1 ? 'pick' : 'picks'} curated
            </p>
          </div>
        </header>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Current picks
          </h2>
          {loading ? (
            <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
          ) : sorted.length === 0 ? (
            <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-8 text-center text-sm text-[var(--color-fg-tertiary)] italic">
              No picks yet. Use the panel below to add one.
            </div>
          ) : (
            <ul className="space-y-2">
              {sorted.map((item, idx) => (
                <ThisWeekRow
                  key={item.id}
                  item={item}
                  busy={busy.has(item.id)}
                  isFirst={idx === 0}
                  isLast={idx === sorted.length - 1}
                  onMoveUp={() => handleMove(item, -1)}
                  onMoveDown={() => handleMove(item, 1)}
                  onRemove={() => handleRemove(item)}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Add a pick
          </h2>
          <AddPanel onAdded={handleAdded} />
        </section>
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

function ThisWeekRow({
  item,
  busy,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: ThisWeekItem
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  return (
    <li className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3">
      <div className="flex items-start gap-3">
        <Thumbnail src={item.artwork_url} alt={item.title} />

        <div className="flex-1 min-w-0">
          {item.release_url ? (
            <Link
              href={item.release_url}
              className="font-semibold text-sm text-[var(--color-fg-primary)] truncate hover:text-[var(--color-accent)] transition-colors block"
            >
              {item.title}
            </Link>
          ) : (
            <p className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
              {item.title}
            </p>
          )}
          {item.artist_name && (
            <p className="text-xs text-[var(--color-fg-secondary)] truncate">
              {item.artist_name}
            </p>
          )}
          {!item.submission_id && item.source_url && (
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] truncate">
              External link
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={busy || isFirst}
            aria-label="Move up"
            className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] border border-[var(--color-border-default)] rounded-[var(--radius)] w-7 h-7 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={busy || isLast}
            aria-label="Move down"
            className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] border border-[var(--color-border-default)] rounded-[var(--radius)] w-7 h-7 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

// AddPanel hosts the two add modes: pick from approved submissions, or paste
// an external link (Spotify/YouTube/anything with OpenGraph) and let the
// admin edit the resolved metadata before saving as a standalone row.
function AddPanel({ onAdded }: { onAdded: (item: ThisWeekItem) => void }) {
  const [mode, setMode] = useState<'submission' | 'link'>('submission')
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 space-y-4">
      <div
        role="tablist"
        className="flex gap-1 border-b border-[var(--color-border-subtle)] -mx-1 px-1"
      >
        <TabButton active={mode === 'submission'} onClick={() => setMode('submission')}>
          From submissions
        </TabButton>
        <TabButton active={mode === 'link'} onClick={() => setMode('link')}>
          Paste a link
        </TabButton>
      </div>
      {mode === 'submission' ? (
        <SubmissionPicker onAdded={onAdded} />
      ) : (
        <LinkPaster onAdded={onAdded} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`text-xs font-semibold uppercase tracking-wider px-3 py-2 transition-colors border-b-2 -mb-[1px] ${
        active
          ? 'text-[var(--color-fg-primary)] border-[var(--color-accent)]'
          : 'text-[var(--color-fg-tertiary)] border-transparent hover:text-[var(--color-fg-secondary)]'
      }`}
    >
      {children}
    </button>
  )
}

function LinkPaster({ onAdded }: { onAdded: (item: ThisWeekItem) => void }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [artwork, setArtwork] = useState('')
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  async function handleResolve() {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste a URL first')
      return
    }
    setResolving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/this-week/resolve?url=${encodeURIComponent(trimmed)}`,
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lookup failed')
      setTitle(typeof data.title === 'string' ? data.title : '')
      setArtist(typeof data.artist === 'string' ? data.artist : '')
      setArtwork(typeof data.artwork === 'string' ? data.artwork : '')
      setTouched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setResolving(false)
    }
  }

  async function handleSave() {
    const trimmedUrl = url.trim()
    const trimmedTitle = title.trim()
    if (!trimmedUrl) {
      setError('URL is required')
      return
    }
    if (!trimmedTitle) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/this-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_url: trimmedUrl,
          title: trimmedTitle,
          artist_name: artist.trim() || null,
          artwork_url: artwork.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onAdded(data.item as ThisWeekItem)
      setUrl('')
      setTitle('')
      setArtist('')
      setArtwork('')
      setTouched(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const previewSrc = artwork.trim() || null

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Track / release URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/… or https://youtu.be/…"
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolving || !url.trim()}
            className="text-sm font-semibold border border-[var(--color-border-default)] text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] disabled:opacity-40 rounded-[var(--radius)] px-4 transition-colors whitespace-nowrap"
          >
            {resolving ? 'Looking…' : 'Look up'}
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-1.5">
          Spotify, YouTube, or any page with OpenGraph tags. Fields below are editable — fill in anything the lookup misses.
        </p>
      </div>

      {touched && (
        <div className="grid grid-cols-[64px_1fr] gap-3 items-start">
          <Thumbnail src={previewSrc} alt={title || 'Preview'} />
          <div className="space-y-2 min-w-0">
            <div>
              <label className={labelCls}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist name (optional)"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Artwork URL</label>
              <input
                type="url"
                value={artwork}
                onChange={(e) => setArtwork(e.target.value)}
                placeholder="https://…"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}

      {touched && (
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !url.trim()}
            className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-5 py-2 transition-colors"
          >
            {saving ? 'Saving…' : 'Add to This Week'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  )
}

function SubmissionPicker({ onAdded }: { onAdded: (item: ThisWeekItem) => void }) {
  const [filter, setFilter] = useState('')
  const [candidates, setCandidates] = useState<SubmissionCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SubmissionCandidate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        const q = filter.trim()
        if (q) params.set('q', q)
        const res = await fetch(`/api/admin/this-week/candidates?${params}`, {
          signal: ctrl.signal,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load candidates')
        setCandidates(data.candidates ?? [])
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load candidates')
        setCandidates([])
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [filter])

  function handlePick(c: SubmissionCandidate) {
    setSelected(c)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/this-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onAdded(data.item as ThisWeekItem)
      setSelected(null)
      setFilter('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Search approved releases / singles</label>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by title…"
          className={inputCls}
        />
      </div>

      <div>
        {loading ? (
          <p className="text-xs text-[var(--color-fg-tertiary)]">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-[var(--color-fg-tertiary)] italic">
            No submissions match.
          </p>
        ) : (
          <ul className="space-y-0.5 max-h-72 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius)] bg-[var(--color-bg-input)]">
            {candidates.map((c) => {
              const isSelected = selected?.id === c.id
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-bg-higher)]'
                        : 'hover:bg-[var(--color-bg-higher)]'
                    }`}
                  >
                    <Thumbnail src={c.artwork_url} alt={c.title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--color-fg-primary)] truncate">
                        {c.title}
                      </p>
                      {c.artist_name && (
                        <p className="text-xs text-[var(--color-fg-secondary)] truncate">
                          {c.artist_name}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] flex-shrink-0">
                        Selected
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          <p className="text-sm text-[var(--color-fg-secondary)] truncate">
            Add <span className="font-semibold text-[var(--color-fg-primary)]">{selected.title}</span>
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-5 py-2 transition-colors"
          >
            {saving ? 'Saving…' : 'Add to This Week'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  )
}

function Thumbnail({
  src,
  alt,
  size = 'md',
}: {
  src: string | null
  alt: string
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'w-9 h-9' : 'w-12 h-12'
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`${dim} rounded-[var(--radius)] object-cover flex-shrink-0`}
        loading="lazy"
      />
    )
  }
  const initials = alt
    ? alt.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : '♪'
  return (
    <div
      className={`${dim} rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)] flex-shrink-0`}
    >
      {initials}
    </div>
  )
}
