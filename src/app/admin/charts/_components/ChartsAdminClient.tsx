'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type ArtistOption = {
  id: string
  slug: string
  name: string
  image_url: string | null
}

type ChartRow = {
  id: string
  chart_key: string
  source: 'shazam' | 'manual'
  position: number
  title: string
  artist_name: string
  artwork_url: string | null
  apple_music_url: string | null
  isrc: string | null
  external_id: string | null
  artist_id: string | null
  status: 'draft' | 'published'
  captured_at: string | null
  created_at: string
  updated_at: string
  artist: ArtistOption | null
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const labelCls =
  'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'

function formatStamp(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChartsAdminClient({ chartKey }: { chartKey: string }) {
  const [items, setItems] = useState<ChartRow[]>([])
  const [label, setLabel] = useState<string>('Charts')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/charts?chart_key=${encodeURIComponent(chartKey)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load chart')
      setItems(data.items ?? [])
      if (typeof data.label === 'string') setLabel(data.label)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
    }
  }, [chartKey])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/charts?chart_key=${encodeURIComponent(chartKey)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? 'Failed to load chart')
        setItems(data.items ?? [])
        if (typeof data.label === 'string') setLabel(data.label)
      } catch (err) {
        if (!cancelled) {
          setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [chartKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  function markBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  const drafts = useMemo(
    () => items.filter((i) => i.status === 'draft').sort((a, b) => a.position - b.position),
    [items],
  )
  const published = useMemo(
    () => items.filter((i) => i.status === 'published').sort((a, b) => a.position - b.position),
    [items],
  )

  // Refresh from Shazam
  async function handleShazamRefresh() {
    const ok = drafts.length === 0
      ? true
      : window.confirm(`This will replace the current ${drafts.length} draft row(s) with a fresh pull from Shazam. Continue?`)
    if (!ok) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/charts/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_key: chartKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Refresh failed')
      }
      if (data.ok === false) {
        // Loud failure from upstream — Shazam blocked us or contract changed.
        setToast({ kind: 'error', msg: `Shazam refresh failed: ${data.message ?? 'unknown error'}` })
      } else {
        setToast({
          kind: 'success',
          msg: `Pulled ${data.inserted} tracks from Shazam (captured ${formatStamp(data.captured_at)})`,
        })
        await refresh()
      }
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Refresh failed' })
    } finally {
      setRefreshing(false)
    }
  }

  async function handlePublish() {
    const ok = window.confirm(
      `Publish ${drafts.length} draft row(s) live? This will replace the current ${published.length} published row(s).`,
    )
    if (!ok) return
    setPublishing(true)
    try {
      const res = await fetch('/api/admin/charts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart_key: chartKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setToast({ kind: 'success', msg: `Published ${data.published_count} rows live` })
      await refresh()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Publish failed' })
    } finally {
      setPublishing(false)
    }
  }

  async function handleMove(item: ChartRow, direction: -1 | 1) {
    const idx = drafts.findIndex((i) => i.id === item.id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= drafts.length) return
    const a = drafts[idx]
    const b = drafts[swapIdx]
    markBusy(a.id, true)
    markBusy(b.id, true)
    try {
      const r1 = await fetch(`/api/admin/charts/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: b.position }),
      })
      if (!r1.ok) throw new Error('Failed to reorder')
      const r2 = await fetch(`/api/admin/charts/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: a.position }),
      })
      if (!r2.ok) throw new Error('Failed to reorder')
      await refresh()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Reorder failed' })
      await refresh()
    } finally {
      markBusy(a.id, false)
      markBusy(b.id, false)
    }
  }

  async function handleDelete(item: ChartRow) {
    const ok = window.confirm(`Remove "${item.title}" by ${item.artist_name}?`)
    if (!ok) return
    markBusy(item.id, true)
    try {
      const res = await fetch(`/api/admin/charts/${item.id}`, { method: 'DELETE' })
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

  async function handleRowSave(id: string, patch: Partial<ChartRow>) {
    markBusy(id, true)
    try {
      const res = await fetch(`/api/admin/charts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setItems((prev) => prev.map((i) => (i.id === id ? (data.item as ChartRow) : i)))
      setToast({ kind: 'success', msg: 'Saved' })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      markBusy(id, false)
    }
  }

  function handleAdded(newItem: ChartRow) {
    setItems((prev) => [...prev, newItem])
    setToast({ kind: 'success', msg: 'Added' })
  }

  const lastCapturedAt = drafts.length > 0 ? drafts[0].captured_at : null
  const livePublishedAt = published.length > 0 ? published[0].captured_at : null

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
              Charts
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">{label}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleShazamRefresh}
              disabled={refreshing}
              className="text-sm font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] disabled:opacity-50 transition-colors"
            >
              {refreshing ? 'Pulling from Shazam…' : 'Refresh from Shazam'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || drafts.length === 0}
              className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-4 py-2 disabled:opacity-50 transition-colors"
            >
              {publishing ? 'Publishing…' : `Publish ${drafts.length || ''}`.trim()}
            </button>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : (
          <>
            <section className="mb-10">
              <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
                <div>
                  <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold">
                    Draft (next publish)
                  </h2>
                  {lastCapturedAt && (
                    <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">
                      Last refresh: {formatStamp(lastCapturedAt)}
                    </p>
                  )}
                </div>
                <p className="text-xs text-[var(--color-fg-tertiary)]">
                  {drafts.length} row{drafts.length === 1 ? '' : 's'}
                </p>
              </div>

              {drafts.length === 0 ? (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-8 text-center text-sm text-[var(--color-fg-tertiary)] italic">
                  No drafts yet. Use &ldquo;Refresh from Shazam&rdquo; above, or add a row manually below.
                </div>
              ) : (
                <ul className="space-y-2">
                  {drafts.map((item, idx) => (
                    // updated_at in the key remounts the row when the parent
                    // re-fetches it (refresh / move / save). That resets the
                    // form's local state without needing a prop-sync useEffect.
                    <DraftRow
                      key={`${item.id}-${item.updated_at}`}
                      item={item}
                      busy={busy.has(item.id)}
                      isFirst={idx === 0}
                      isLast={idx === drafts.length - 1}
                      onMoveUp={() => handleMove(item, -1)}
                      onMoveDown={() => handleMove(item, 1)}
                      onDelete={() => handleDelete(item)}
                      onSave={(patch) => handleRowSave(item.id, patch)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="mb-10">
              <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
                Add manual row
              </h2>
              <ManualAddPanel chartKey={chartKey} onAdded={handleAdded} />
            </section>

            <section>
              <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
                <div>
                  <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold">
                    Currently live
                  </h2>
                  {livePublishedAt && (
                    <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">
                      As of: {formatStamp(livePublishedAt)}
                    </p>
                  )}
                </div>
                <p className="text-xs text-[var(--color-fg-tertiary)]">
                  {published.length} row{published.length === 1 ? '' : 's'}
                </p>
              </div>
              {published.length === 0 ? (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 text-center text-sm text-[var(--color-fg-tertiary)] italic">
                  Nothing published yet.
                </div>
              ) : (
                <ul className="space-y-1">
                  {published.map((item) => (
                    <li
                      key={item.id}
                      className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-2.5 flex items-center gap-3"
                    >
                      <span className="w-6 text-center text-sm font-bold text-[var(--color-fg-tertiary)] tabular-nums">
                        {item.position}
                      </span>
                      <Thumbnail src={item.artwork_url} alt={item.title} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--color-fg-primary)] truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-[var(--color-fg-secondary)] truncate">
                          {item.artist_name}
                          {item.artist && (
                            <span className="ml-1 text-[var(--color-accent)]">
                              · matched
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] shrink-0">
                        {item.source}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-4 z-50 max-w-md rounded-[var(--radius)] px-4 py-3 text-sm shadow-lg border ${
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

function DraftRow({
  item,
  busy,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSave,
}: {
  item: ChartRow
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onSave: (patch: Partial<ChartRow>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [artistName, setArtistName] = useState(item.artist_name)
  const [artworkUrl, setArtworkUrl] = useState(item.artwork_url ?? '')
  const [appleMusicUrl, setAppleMusicUrl] = useState(item.apple_music_url ?? '')
  const [artistMatch, setArtistMatch] = useState<ArtistOption | null>(item.artist)
  const [artistPickerOpen, setArtistPickerOpen] = useState(false)

  // Note: no prop→state sync effect — the parent keys this component on
  // `${item.id}-${item.updated_at}` so React remounts (and re-initializes
  // the useState defaults above) whenever the row's server data changes.

  function cancel() {
    setTitle(item.title)
    setArtistName(item.artist_name)
    setArtworkUrl(item.artwork_url ?? '')
    setAppleMusicUrl(item.apple_music_url ?? '')
    setArtistMatch(item.artist)
    setEditing(false)
  }

  async function save() {
    const patch: Partial<ChartRow> & { artwork_url?: string | null; apple_music_url?: string | null; artist_id?: string | null } = {}
    if (title.trim() !== item.title) patch.title = title.trim()
    if (artistName.trim() !== item.artist_name) patch.artist_name = artistName.trim()
    const aw = artworkUrl.trim() || null
    if (aw !== item.artwork_url) patch.artwork_url = aw
    const am = appleMusicUrl.trim() || null
    if (am !== item.apple_music_url) patch.apple_music_url = am
    if ((artistMatch?.id ?? null) !== item.artist_id) {
      patch.artist_id = artistMatch?.id ?? null
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    onSave(patch)
    setEditing(false)
  }

  return (
    <li className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="w-6 text-center text-sm font-bold text-[var(--color-fg-tertiary)] tabular-nums mt-1">
          {item.position}
        </span>
        <Thumbnail src={editing ? (artworkUrl.trim() || null) : item.artwork_url} alt={item.title} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <div>
                <label className={labelCls}>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Artist</label>
                <input
                  type="text"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Artwork URL</label>
                <input
                  type="url"
                  value={artworkUrl}
                  onChange={(e) => setArtworkUrl(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Apple Music URL</label>
                <input
                  type="url"
                  value={appleMusicUrl}
                  onChange={(e) => setAppleMusicUrl(e.target.value)}
                  className={inputCls}
                />
              </div>
              <ArtistMatchField
                current={artistMatch}
                open={artistPickerOpen}
                onOpenChange={setArtistPickerOpen}
                onPick={(a) => { setArtistMatch(a); setArtistPickerOpen(false) }}
                onClear={() => setArtistMatch(null)}
              />
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-4 py-2 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-xs font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
                {item.title}
              </p>
              <p className="text-xs text-[var(--color-fg-secondary)] truncate">
                {item.artist_name}
                {item.artist && (
                  <Link
                    href={`/artist/${item.artist.slug}`}
                    className="ml-1 text-[var(--color-accent)] hover:underline"
                  >
                    · matched to {item.artist.name}
                  </Link>
                )}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] mt-1">
                source: {item.source}
                {item.apple_music_url && (
                  <a
                    href={item.apple_music_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
                  >
                    Apple Music ↗
                  </a>
                )}
              </p>
            </>
          )}
        </div>

        {!editing && (
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
              onClick={() => setEditing(true)}
              disabled={busy}
              className="text-xs font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-1.5 text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] disabled:opacity-40 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function ManualAddPanel({
  chartKey,
  onAdded,
}: {
  chartKey: string
  onAdded: (row: ChartRow) => void
}) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [artwork, setArtwork] = useState('')
  const [appleMusic, setAppleMusic] = useState('')
  const [artistMatch, setArtistMatch] = useState<ArtistOption | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!title.trim() || !artist.trim()) {
      setError('Title and artist are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart_key: chartKey,
          title: title.trim(),
          artist_name: artist.trim(),
          artwork_url: artwork.trim() || null,
          apple_music_url: appleMusic.trim() || null,
          artist_id: artistMatch?.id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onAdded(data.item as ChartRow)
      setTitle(''); setArtist(''); setArtwork(''); setAppleMusic(''); setArtistMatch(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            placeholder="Artist name"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Artwork URL (optional)</label>
          <input
            type="url"
            value={artwork}
            onChange={(e) => setArtwork(e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Apple Music URL (optional)</label>
          <input
            type="url"
            value={appleMusic}
            onChange={(e) => setAppleMusic(e.target.value)}
            placeholder="https://music.apple.com/…"
            className={inputCls}
          />
        </div>
      </div>
      <ArtistMatchField
        current={artistMatch}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(a) => { setArtistMatch(a); setPickerOpen(false) }}
        onClear={() => setArtistMatch(null)}
      />
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
        {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim() || !artist.trim()}
          className="ml-auto text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-5 py-2 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding…' : 'Add to drafts'}
        </button>
      </div>
    </div>
  )
}

// Generic artist-match picker — reused by both the inline DraftRow edit form
// and ManualAddPanel. Hits the existing /api/admin/events/artists search
// route (which is just a roster lookup; not events-specific despite the path).
function ArtistMatchField({
  current,
  open,
  onOpenChange,
  onPick,
  onClear,
}: {
  current: ArtistOption | null
  open: boolean
  onOpenChange: (next: boolean) => void
  onPick: (a: ArtistOption) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ArtistOption[]>([])
  const [loading, setLoading] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        const q = query.trim()
        if (q) params.set('q', q)
        const res = await fetch(`/api/admin/events/artists?${params}`, { signal: ctrl.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to search')
        setOptions(data.artists ?? [])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setOptions([])
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [query, open])

  return (
    <div>
      <label className={labelCls}>Match to roster artist (optional)</label>
      {current ? (
        <div className="inline-flex items-center gap-2 bg-[var(--color-bg-higher)] rounded-full pl-2.5 pr-1 py-1 text-xs text-[var(--color-fg-primary)]">
          {current.name}
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear match`}
            className="w-5 h-5 rounded-full text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] hover:bg-white/10 transition-colors"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="text-xs font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-1.5 text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] transition-colors"
        >
          {open ? 'Hide search' : 'Match artist'}
        </button>
      )}
      {open && !current && (
        <div className="mt-2 space-y-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roster by name…"
            className={inputCls}
            autoFocus
          />
          {loading ? (
            <p className="text-xs text-[var(--color-fg-tertiary)]">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-tertiary)] italic">No artists match.</p>
          ) : (
            <ul className="space-y-0.5 max-h-60 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius)] bg-[var(--color-bg-input)]">
              {options.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onPick(a)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-bg-higher)] transition-colors"
                  >
                    <Thumbnail src={a.image_url} alt={a.name} size="sm" />
                    <span className="text-sm text-[var(--color-fg-primary)] flex-1 truncate">
                      {a.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
