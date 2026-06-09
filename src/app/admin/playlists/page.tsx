'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// Manage the tracked-playlist whitelist that feeds the Spotify playlist scraper.
// Add a playlist by pasting its Spotify URL; toggle is_active; remove. The actual
// scan is triggered from the Scrapers page. (The public Playlists homepage row is
// a separate, later piece — this page only manages playlists as a content source.)

type Playlist = {
  id: string
  spotify_playlist_id: string
  name: string | null
  description: string | null
  image_url: string | null
  owner_name: string | null
  is_active: boolean
  last_scanned_at: string | null
  created_at: string
}

function formatScanned(value: string | null): string {
  if (!value) return 'never scanned'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'never scanned'
  return `scanned ${d.toLocaleString()}`
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/playlists')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load playlists')
      setPlaylists(Array.isArray(data.playlists) ? data.playlists : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load playlists')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value) return
    setAdding(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/playlists/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to add playlist')
      setUrl('')
      if (data.alreadyExists) setNotice(`"${data.playlist?.name ?? 'Playlist'}" is already tracked.`)
      else setNotice(`Added "${data.playlist?.name ?? 'playlist'}".`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add playlist')
    } finally {
      setAdding(false)
    }
  }

  async function toggle(pl: Playlist) {
    setBusyId(pl.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/playlists/${pl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !pl.is_active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update playlist')
      setPlaylists((prev) =>
        prev.map((p) => (p.id === pl.id ? { ...p, is_active: data.playlist?.is_active ?? !p.is_active } : p))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update playlist')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(pl: Playlist) {
    if (!window.confirm(`Remove "${pl.name ?? pl.spotify_playlist_id}" from tracked playlists?`)) return
    setBusyId(pl.id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/playlists/${pl.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to remove playlist')
      setPlaylists((prev) => prev.filter((p) => p.id !== pl.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove playlist')
    } finally {
      setBusyId(null)
    }
  }

  const fieldClass =
    'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors disabled:opacity-50'

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Tracked playlists
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/scrapers"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Scrapers
            </Link>
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Back to admin
            </Link>
          </div>
        </div>

        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">What this is</h2>
          <p className="text-sm text-[var(--color-fg-secondary)]">
            A curated whitelist of Spotify playlists the playlist scraper scans for new releases.
            Adding a playlist here makes it a content source — its tracks&apos; albums publish as
            approved drops when you run the playlist scan. Curating a playlist onto this list is the
            trust gate, so scraped drops go live automatically.
          </p>
        </div>

        {/* Add playlist */}
        <form onSubmit={add} className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <label htmlFor="playlist-url" className="block text-sm font-semibold text-[var(--color-fg-primary)] mb-2">
            Add a playlist
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="playlist-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={adding}
              placeholder="https://open.spotify.com/playlist/…"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={adding || !url.trim()}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-2 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-[var(--color-fg-tertiary)] mt-2">
            Paste a Spotify playlist URL, URI, or id.
          </p>
        </form>

        {error && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 mb-6 border border-[var(--color-error)]">
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          </div>
        )}
        {notice && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 mb-6 border border-[var(--color-border-default)]">
            <p className="text-sm text-[var(--color-fg-secondary)]">{notice}</p>
          </div>
        )}

        {/* List */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
              Playlists{playlists.length > 0 ? ` (${playlists.length})` : ''}
            </h2>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-tertiary)]">
              No tracked playlists yet. Add one above to start scraping it.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-default)]">
              {playlists.map((pl) => (
                <li key={pl.id} className="flex items-center gap-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pl.image_url || '/placeholder-cover.png'}
                    alt={pl.name || 'Playlist'}
                    className="w-12 h-12 rounded-[var(--radius)] object-cover bg-[var(--color-bg-base)] flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`https://open.spotify.com/playlist/${pl.spotify_playlist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-[var(--color-fg-primary)] hover:underline truncate block"
                    >
                      {pl.name || pl.spotify_playlist_id}
                    </a>
                    <p className="text-xs text-[var(--color-fg-tertiary)] truncate">
                      {pl.owner_name ? `${pl.owner_name} · ` : ''}
                      {formatScanned(pl.last_scanned_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(pl)}
                    disabled={busyId === pl.id}
                    className={`text-xs font-semibold rounded-full px-3 py-1 border transition-colors disabled:opacity-50 ${
                      pl.is_active
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border-default)] text-[var(--color-fg-tertiary)]'
                    }`}
                    title="Toggle whether the scraper scans this playlist"
                  >
                    {pl.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(pl)}
                    disabled={busyId === pl.id}
                    className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-error)] transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
