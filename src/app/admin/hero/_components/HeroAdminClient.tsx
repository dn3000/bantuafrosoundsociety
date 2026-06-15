'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ── Types (mirror ResolvedHeroItem from src/lib/hero.ts, plus the candidates shape) ──

type HeroRefType = 'submission' | 'video' | 'playlist' | 'article'

type HeroItem = {
  id: string
  position: number
  ref_type: HeroRefType
  ref_id: string
  kicker: string | null
  headline: string | null
  is_published: boolean
  created_at: string
  updated_at: string
  imageUrl: string | null
  title: string
  subtitle: string | null
  typeBadge: string
  href: string
  refMissing: boolean
}

type Candidate = {
  ref_id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  autoKicker: string
  autoHeadline: string
}

const REF_TYPE_LABELS: Record<HeroRefType, string> = {
  submission: 'Submission',
  video: 'Video',
  playlist: 'Playlist',
  article: 'Article',
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const labelCls =
  'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'

// ── Page ─────────────────────────────────────────────────────────────────────

export function HeroAdminClient() {
  const [items, setItems] = useState<HeroItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hero')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load hero items')
      setItems(data.items ?? [])
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/hero')
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? 'Failed to load hero items')
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

  async function patchItem(id: string, body: Record<string, unknown>): Promise<HeroItem | null> {
    markBusy(id, true)
    try {
      const res = await fetch(`/api/admin/hero/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      return data.item as HeroItem
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Update failed' })
      return null
    } finally {
      markBusy(id, false)
    }
  }

  async function handleTogglePublish(item: HeroItem) {
    const next = await patchItem(item.id, { is_published: !item.is_published })
    if (next) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)))
      setToast({ kind: 'success', msg: next.is_published ? 'Published' : 'Unpublished' })
    }
  }

  async function handleMove(item: HeroItem, direction: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((i) => i.id === item.id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    markBusy(a.id, true)
    markBusy(b.id, true)
    try {
      // Swap positions in two PATCH calls. Position is a plain int with no
      // uniqueness constraint, so even if the second call fails the table
      // stays in a recoverable state (we re-fetch on error).
      const r1 = await fetch(`/api/admin/hero/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: b.position }),
      })
      if (!r1.ok) throw new Error('Failed to move item')
      const r2 = await fetch(`/api/admin/hero/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: a.position }),
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

  async function handleDelete(item: HeroItem) {
    const ok = window.confirm(`Remove "${item.headline ?? item.title}" from the hero?`)
    if (!ok) return
    markBusy(item.id, true)
    try {
      const res = await fetch(`/api/admin/hero/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Delete failed')
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setToast({ kind: 'success', msg: 'Removed' })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      markBusy(item.id, false)
    }
  }

  async function handleSaveCopy(item: HeroItem, kicker: string, headline: string) {
    const next = await patchItem(item.id, { kicker, headline })
    if (next) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)))
      setToast({ kind: 'success', msg: 'Saved' })
    }
  }

  function handleAdded(newItem: HeroItem) {
    setItems((prev) => [...prev, newItem].sort((a, b) => a.position - b.position))
    setToast({ kind: 'success', msg: 'Added to hero' })
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
              Hero manager
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {sorted.length} {sorted.length === 1 ? 'item' : 'items'} ·{' '}
              {sorted.filter((i) => i.is_published).length} published
            </p>
          </div>
        </header>

        {/* List */}
        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Hero items
          </h2>
          {loading ? (
            <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
          ) : sorted.length === 0 ? (
            <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-8 text-center text-sm text-[var(--color-fg-tertiary)] italic">
              No hero items yet. Use the panel below to add one.
            </div>
          ) : (
            <ul className="space-y-2">
              {sorted.map((item, idx) => (
                <HeroRow
                  key={item.id}
                  item={item}
                  busy={busy.has(item.id)}
                  isFirst={idx === 0}
                  isLast={idx === sorted.length - 1}
                  onTogglePublish={() => handleTogglePublish(item)}
                  onMoveUp={() => handleMove(item, -1)}
                  onMoveDown={() => handleMove(item, 1)}
                  onDelete={() => handleDelete(item)}
                  onSaveCopy={(kicker, headline) => handleSaveCopy(item, kicker, headline)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Add panel */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
            Add to hero
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

// ── Hero row ─────────────────────────────────────────────────────────────────

function HeroRow({
  item,
  busy,
  isFirst,
  isLast,
  onTogglePublish,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaveCopy,
}: {
  item: HeroItem
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onTogglePublish: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onSaveCopy: (kicker: string, headline: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [kicker, setKicker] = useState('')
  const [headline, setHeadline] = useState('')

  function openEditor() {
    setKicker(item.kicker ?? '')
    setHeadline(item.headline ?? '')
    setEditing(true)
  }

  function closeEditor() {
    setEditing(false)
  }

  const dirty = (kicker ?? '') !== (item.kicker ?? '') || (headline ?? '') !== (item.headline ?? '')

  return (
    <li className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3 space-y-2.5">
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <Thumbnail src={item.imageUrl} alt={item.title} />

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] flex-shrink-0">
              {item.typeBadge}
            </span>
            <span className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
              {item.headline ?? item.title}
            </span>
            {item.refMissing && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-error)] text-[var(--color-bg-base)] flex-shrink-0">
                ref missing
              </span>
            )}
          </div>
          {item.kicker && (
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)]">
              {item.kicker}
            </p>
          )}
          <p className="text-xs text-[var(--color-fg-secondary)] truncate">
            {item.title}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </p>
          {item.href !== '#' && (
            <Link
              href={item.href}
              target="_blank"
              className="text-[10px] text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] underline decoration-dotted underline-offset-2"
            >
              {item.href} ↗
            </Link>
          )}
        </div>

        {/* Right rail: actions */}
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
            onClick={onTogglePublish}
            disabled={busy}
            className={`text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border transition-colors disabled:opacity-50 ${
              item.is_published
                ? 'border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-[var(--color-bg-base)]'
                : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)]'
            }`}
          >
            {item.is_published ? 'Published' : 'Draft'}
          </button>
          <button
            type="button"
            onClick={editing ? closeEditor : openEditor}
            className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 pt-1">
          <div>
            <label className={labelCls}>Kicker</label>
            <input
              type="text"
              value={kicker}
              onChange={(e) => setKicker(e.target.value)}
              placeholder="NEW RELEASE"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Artist — Title"
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onSaveCopy(kicker, headline)}
              disabled={busy || !dirty}
              className="w-full sm:w-auto text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-4 py-2 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ── Add panel ────────────────────────────────────────────────────────────────

function AddPanel({ onAdded }: { onAdded: (item: HeroItem) => void }) {
  const [refType, setRefType] = useState<HeroRefType>('submission')
  const [filter, setFilter] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [kicker, setKicker] = useState('')
  const [headline, setHeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced load on type/filter change. AbortController prevents a stale
  // earlier fetch from clobbering a newer one if the user types fast. State
  // mutations are inside the deferred timeout callback, so nothing fires
  // synchronously from the effect body.
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ type: refType })
        const q = filter.trim()
        if (q) params.set('q', q)
        const res = await fetch(`/api/admin/hero/candidates?${params}`, { signal: ctrl.signal })
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
  }, [refType, filter])

  function handleTypeChange(t: HeroRefType) {
    setRefType(t)
    setSelected(null)
    setKicker('')
    setHeadline('')
  }

  function handlePick(c: Candidate) {
    setSelected(c)
    setKicker(c.autoKicker)
    setHeadline(c.autoHeadline)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref_type: refType,
          ref_id: selected.ref_id,
          kicker: kicker.trim() || null,
          headline: headline.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onAdded(data.item as HeroItem)
      // Reset the form so the admin can add another item without re-typing.
      setSelected(null)
      setKicker('')
      setHeadline('')
      setFilter('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 space-y-4">
      {/* Type selector */}
      <div>
        <p className={labelCls}>Type</p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(REF_TYPE_LABELS) as HeroRefType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`px-3 py-1.5 rounded-[var(--radius)] text-sm font-medium border transition-colors ${
                refType === t
                  ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-fg-primary)]'
                  : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)]'
              }`}
            >
              {REF_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Filter box */}
      <div>
        <label className={labelCls}>Filter</label>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Search ${REF_TYPE_LABELS[refType].toLowerCase()}s…`}
          className={inputCls}
        />
      </div>

      {/* Candidates list */}
      <div>
        {loading ? (
          <p className="text-xs text-[var(--color-fg-tertiary)]">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-[var(--color-fg-tertiary)] italic">
            No {REF_TYPE_LABELS[refType].toLowerCase()}s match.
          </p>
        ) : (
          <ul className="space-y-0.5 max-h-72 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius)] bg-[var(--color-bg-input)]">
            {candidates.map((c) => {
              const isSelected = selected?.ref_id === c.ref_id
              return (
                <li key={c.ref_id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-bg-higher)]'
                        : 'hover:bg-[var(--color-bg-higher)]'
                    }`}
                  >
                    <Thumbnail src={c.imageUrl} alt={c.title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--color-fg-primary)] truncate">{c.title}</p>
                      {c.subtitle && (
                        <p className="text-xs text-[var(--color-fg-secondary)] truncate">
                          {c.subtitle}
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

      {/* Kicker + Headline + Save */}
      {selected && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <div>
            <label className={labelCls}>Kicker</label>
            <input
              type="text"
              value={kicker}
              onChange={(e) => setKicker(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Headline</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-5 py-2 transition-colors"
            >
              {saving ? 'Saving…' : 'Add to hero'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  )
}

// ── Thumbnail ────────────────────────────────────────────────────────────────

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
