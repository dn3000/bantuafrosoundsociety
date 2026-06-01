'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type PreviewArtist = {
  spotifyId: string
  name: string
  foundIn: string[]
  alreadyExists: boolean
  imageUrl: string | null
  genres: string[]
  followers: number
  popularity: number
}

type PreviewResponse = {
  playlists: { url: string; id: string; name: string; ownerName: string | null; trackCount: number; artistCount: number }[]
  failures: { url: string; error: string }[]
  artists: PreviewArtist[]
  totalUnique: number
  totalExisting: number
  totalNew: number
}

export default function ImportArtistsPage() {
  const router = useRouter()
  const [urlsInput, setUrlsInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkTier, setBulkTier] = useState('watch')
  const [bulkStatus, setBulkStatus] = useState('active')
  const [bulkTracked, setBulkTracked] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setPreview(null)
    setImportResult(null)
    try {
      const urls = urlsInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch('/api/admin/artists/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data as PreviewResponse)
      const initiallySelected = new Set<string>(
        (data as PreviewResponse).artists
          .filter((a) => !a.alreadyExists)
          .map((a) => a.spotifyId)
      )
      setSelected(initiallySelected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllNew() {
    if (!preview) return
    setSelected(new Set(preview.artists.filter((a) => !a.alreadyExists).map((a) => a.spotifyId)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleImport() {
    if (selected.size === 0) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/artists/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artists: preview!.artists
            .filter((a) => selected.has(a.spotifyId))
            .map((a) => ({
              spotifyId: a.spotifyId,
              name: a.name,
              imageUrl: a.imageUrl,
              genres: a.genres,
            })),
          tier: bulkTier,
          status: bulkStatus,
          isTracked: bulkTracked,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportResult(data as { imported: number; skipped: number })
      setTimeout(() => router.push('/admin/artists'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <div className="max-w-5xl mx-auto p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Import artists from playlists
          </h1>
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to artists
          </Link>
        </div>

        {!preview && (
          <form onSubmit={handlePreview} className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--color-fg-primary)] mb-1">
                Spotify playlist URLs
              </label>
              <p className="text-xs text-[var(--color-fg-tertiary)] mb-3">
                One per line. Up to 10 playlists, max 1,000 unique artists per import.
              </p>
              <textarea
                rows={6}
                value={urlsInput}
                onChange={(e) => setUrlsInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/...&#10;https://open.spotify.com/playlist/..."
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !urlsInput.trim()}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-2.5 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Fetching…' : 'Fetch & preview'}
            </button>
            {error && (
              <div className="text-sm text-[var(--color-error)]">
                {error}
                {error.toLowerCase().includes('spotify not connected') && (
                  <div className="mt-2">
                    <Link
                      href="/admin/integrations"
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Go to Integrations →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {preview && (
          <div className="space-y-6">
            {/* Playlist summary */}
            <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
              <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-3">Playlists</h2>
              <ul className="space-y-2 text-sm">
                {preview.playlists.map((p) => (
                  <li key={p.id} className="text-[var(--color-fg-secondary)]">
                    <span className="text-[var(--color-fg-primary)]">{p.name}</span>
                    {p.ownerName && <span className="text-[var(--color-fg-tertiary)]"> by {p.ownerName}</span>}
                    <span className="text-[var(--color-fg-tertiary)]"> — {p.trackCount} tracks, {p.artistCount} artists</span>
                  </li>
                ))}
              </ul>
              {preview.failures.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-sm font-semibold text-[var(--color-error)]">Failed playlists ({preview.failures.length})</p>
                  {preview.failures.map((f) => (
                    <div key={f.url} className="text-xs text-[var(--color-fg-secondary)] bg-[var(--color-bg-base)] rounded-[var(--radius-sm)] p-2">
                      <div className="font-mono break-all">{f.url}</div>
                      <div className="text-[var(--color-error)] mt-1">{f.error}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 text-sm text-[var(--color-fg-secondary)]">
                <strong className="text-[var(--color-fg-primary)]">{preview.totalUnique}</strong> unique artists ·{' '}
                <strong className="text-[var(--color-fg-primary)]">{preview.totalNew}</strong> new ·{' '}
                <strong className="text-[var(--color-fg-primary)]">{preview.totalExisting}</strong> already in DB
              </div>
            </div>

            {/* Bulk controls */}
            <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
              <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-3">
                Defaults for selected artists ({selected.size})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <select
                  value={bulkTier}
                  onChange={(e) => setBulkTier(e.target.value)}
                  className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)]"
                >
                  <option value="watch">Tier: Watch</option>
                  <option value="active">Tier: Active</option>
                  <option value="featured">Tier: Featured</option>
                </select>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)]"
                >
                  <option value="active">Status: Active</option>
                  <option value="inactive">Status: Inactive</option>
                  <option value="hiatus">Status: Hiatus</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-[var(--color-fg-primary)] bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={bulkTracked}
                    onChange={(e) => setBulkTracked(e.target.checked)}
                  />
                  Actively tracked
                </label>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAllNew}
                  className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
                >
                  Select all new
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
                >
                  Clear selection
                </button>
              </div>
            </div>

            {/* Artist grid */}
            <div className="space-y-2">
              {preview.artists.map((a) => {
                const isSelected = selected.has(a.spotifyId)
                const disabled = a.alreadyExists
                return (
                  <label
                    key={a.spotifyId}
                    className={`flex items-center gap-3 p-3 rounded-[var(--radius-md)] cursor-pointer transition-colors ${
                      disabled
                        ? 'bg-[var(--color-bg-elevated)] opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]'
                        : 'bg-[var(--color-bg-elevated)] hover:bg-[var(--color-bg-higher)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => !disabled && toggle(a.spotifyId)}
                      className="h-4 w-4 flex-shrink-0"
                    />
                    {a.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.imageUrl}
                        alt={a.name}
                        className="w-10 h-10 rounded-[var(--radius)] object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--color-fg-primary)] truncate">{a.name}</span>
                        {a.alreadyExists && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] font-semibold">
                            in DB
                          </span>
                        )}
                        {a.popularity > 0 && (
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] font-mono">
                            pop {a.popularity}
                          </span>
                        )}
                      </div>
                      {a.genres.length > 0 && (
                        <p className="text-xs text-[var(--color-fg-tertiary)] truncate">{a.genres.slice(0, 4).join(' · ')}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Import action */}
            <div className="sticky bottom-0 bg-[var(--color-bg-base)] py-4 border-t border-[var(--color-border-subtle)] flex items-center gap-4">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importing…' : `Import ${selected.size} artist${selected.size === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setSelected(new Set())
                  setUrlsInput('')
                }}
                className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
              >
                Start over
              </button>
              {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
              {importResult && (
                <p className="text-sm text-[var(--color-success)]">
                  Imported {importResult.imported} artists. Redirecting…
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
