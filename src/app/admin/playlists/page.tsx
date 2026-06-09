'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type PlaylistRow = {
  id: string
  spotify_playlist_id: string
  name: string | null
  curator_name: string | null
  owner_name: string | null
  description: string | null
  cover_image_url: string | null
  image_url: string | null
  is_published: boolean
  display_order: number
  track_count: number | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

type FieldSet = {
  name: string
  curatorName: string
  description: string
  coverImageUrl: string
  isPublished: boolean
  displayOrder: number
}

const EMPTY: FieldSet = {
  name: '',
  curatorName: '',
  description: '',
  coverImageUrl: '',
  isPublished: true,
  displayOrder: 0,
}

const FC =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors disabled:opacity-50'
const LC = 'block text-xs font-semibold text-[var(--color-fg-secondary)] mb-1'

function Fields({
  fields,
  onChange,
  disabled,
}: {
  fields: FieldSet
  onChange: (f: FieldSet) => void
  disabled: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div>
        <label className={LC}>Title</label>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => onChange({ ...fields, name: e.target.value })}
          disabled={disabled}
          placeholder="Playlist title"
          className={FC}
        />
      </div>
      <div>
        <label className={LC}>Curator</label>
        <input
          type="text"
          value={fields.curatorName}
          onChange={(e) => onChange({ ...fields, curatorName: e.target.value })}
          disabled={disabled}
          placeholder="Curator name"
          className={FC}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={LC}>Description</label>
        <input
          type="text"
          value={fields.description}
          onChange={(e) => onChange({ ...fields, description: e.target.value })}
          disabled={disabled}
          placeholder="Short description (optional)"
          className={FC}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={LC}>Cover image URL</label>
        <input
          type="text"
          value={fields.coverImageUrl}
          onChange={(e) => onChange({ ...fields, coverImageUrl: e.target.value })}
          disabled={disabled}
          placeholder="https://i.scdn.co/…"
          className={FC}
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={fields.isPublished}
            onChange={(e) => onChange({ ...fields, isPublished: e.target.checked })}
            disabled={disabled}
            className="rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-fg-primary)]">Published</span>
        </label>
      </div>
      <div>
        <label className={LC}>Display order</label>
        <input
          type="number"
          value={fields.displayOrder}
          onChange={(e) => onChange({ ...fields, displayOrder: Number(e.target.value) })}
          disabled={disabled}
          className={FC}
        />
      </div>
    </div>
  )
}

function parseIdClient(input: string): string | null {
  const t = input.trim()
  if (/^[0-9A-Za-z]{22}$/.test(t)) return t
  const u = t.match(/playlist\/([0-9A-Za-z]{22})/)
  if (u) return u[1]
  const v = t.match(/^spotify:playlist:([0-9A-Za-z]{22})$/i)
  if (v) return v[1]
  return null
}

export default function CuratedPlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Add-form state
  const [spotifyInput, setSpotifyInput] = useState('')
  const [resolvedId, setResolvedId] = useState('')
  const [fetchBusy, setFetchBusy] = useState(false)
  const [fetchNote, setFetchNote] = useState<'error' | null>(null)
  const [addFields, setAddFields] = useState<FieldSet>(EMPTY)
  const [adding, setAdding] = useState(false)

  // Inline-edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<FieldSet>(EMPTY)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Per-row quick-action busy
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/playlists')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load')
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

  async function fetchMeta() {
    setFetchBusy(true)
    setFetchNote(null)
    try {
      const res = await fetch('/api/admin/playlists/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: spotifyInput }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFetchNote('error')
        return
      }
      setResolvedId(data.playlistId || '')
      setAddFields((f) => ({
        ...f,
        name: data.title || '',
        curatorName: data.curatorName || '',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || '',
      }))
    } catch {
      setFetchNote('error')
    } finally {
      setFetchBusy(false)
    }
  }

  async function addPlaylist(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const id = resolvedId || parseIdClient(spotifyInput)
    if (!id) {
      setError('Could not parse a Spotify playlist id. Click "Fetch from Spotify" or paste a bare 22-character id.')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/admin/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotifyPlaylistId: id,
          name: addFields.name,
          curatorName: addFields.curatorName,
          description: addFields.description,
          coverImageUrl: addFields.coverImageUrl,
          isPublished: addFields.isPublished,
          displayOrder: addFields.displayOrder,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to add')
      setSpotifyInput('')
      setResolvedId('')
      setFetchNote(null)
      setAddFields(EMPTY)
      setNotice(`Added "${data.playlist?.name || 'playlist'}".`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add playlist')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(pl: PlaylistRow) {
    setEditingId(pl.id)
    setEditFields({
      name: pl.name || '',
      curatorName: pl.curator_name || '',
      description: pl.description || '',
      coverImageUrl: pl.cover_image_url || '',
      isPublished: pl.is_published,
      displayOrder: pl.display_order,
    })
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFields.name,
          curatorName: editFields.curatorName,
          description: editFields.description,
          coverImageUrl: editFields.coverImageUrl,
          isPublished: editFields.isPublished,
          displayOrder: editFields.displayOrder,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save')
      setPlaylists((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...(data.playlist as PlaylistRow) } : p))
      )
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  async function togglePublished(pl: PlaylistRow) {
    setBusyId(pl.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/playlists/${pl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !pl.is_published }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to update')
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === pl.id
            ? { ...p, is_published: data.playlist?.is_published ?? !p.is_published }
            : p
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(pl: PlaylistRow) {
    if (!window.confirm(`Remove "${pl.name || pl.spotify_playlist_id}"?`)) return
    setBusyId(pl.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/playlists/${pl.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to remove')
      setPlaylists((prev) => prev.filter((p) => p.id !== pl.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Curated playlists
          </h1>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to admin
          </Link>
        </div>

        {/* Add playlist */}
        <form
          onSubmit={addPlaylist}
          className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6"
        >
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-3">
            Add playlist
          </h2>

          {/* URL input + fetch button */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={spotifyInput}
              onChange={(e) => {
                setSpotifyInput(e.target.value)
                setResolvedId('')
                setFetchNote(null)
              }}
              disabled={adding || fetchBusy}
              placeholder="https://open.spotify.com/playlist/… or bare ID"
              className={FC}
            />
            <button
              type="button"
              onClick={fetchMeta}
              disabled={!spotifyInput.trim() || fetchBusy || adding}
              className="bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)] font-semibold rounded-[var(--radius)] px-4 py-2 text-sm hover:text-[var(--color-fg-primary)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {fetchBusy ? 'Fetching…' : 'Fetch from Spotify'}
            </button>
          </div>

          {fetchNote === 'error' && (
            <p className="text-xs text-[var(--color-fg-tertiary)] mt-2">
              Couldn&apos;t fetch — enter details manually.
            </p>
          )}

          <Fields fields={addFields} onChange={setAddFields} disabled={adding} />

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={adding || !spotifyInput.trim()}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-2 text-sm hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add playlist'}
            </button>
          </div>
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
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-4">
            Playlists{playlists.length > 0 ? ` (${playlists.length})` : ''}
          </h2>

          {loading ? (
            <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-tertiary)]">No playlists yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-default)]">
              {playlists.map((pl) => {
                const thumb = pl.cover_image_url || pl.image_url
                const isEditing = editingId === pl.id
                const isBusy = busyId === pl.id
                const isSaving = savingId === pl.id

                return (
                  <li key={pl.id} className="py-3">
                    {/* Row summary */}
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb || '/placeholder-cover.png'}
                        alt={pl.name || 'Playlist'}
                        className="w-12 h-12 rounded-[var(--radius)] object-cover bg-[var(--color-bg-base)] flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--color-fg-primary)] truncate">
                          {pl.name || pl.spotify_playlist_id}
                        </p>
                        <p className="text-xs text-[var(--color-fg-tertiary)] truncate">
                          {pl.curator_name || pl.owner_name || '—'}
                          {pl.display_order !== 0 ? ` · order ${pl.display_order}` : ''}
                        </p>
                      </div>
                      {/* Published toggle */}
                      <button
                        type="button"
                        onClick={() => togglePublished(pl)}
                        disabled={isBusy || isEditing}
                        className={`text-xs font-semibold rounded-full px-3 py-1 border transition-colors disabled:opacity-50 ${
                          pl.is_published
                            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border-default)] text-[var(--color-fg-tertiary)]'
                        }`}
                      >
                        {pl.is_published ? 'Published' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingId(null) : startEdit(pl))}
                        disabled={isBusy || isSaving}
                        className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors disabled:opacity-50"
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(pl)}
                        disabled={isBusy || isEditing}
                        className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-error)] transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Inline edit */}
                    {isEditing && (
                      <div className="mt-3 pl-15 border-t border-[var(--color-border-default)] pt-3">
                        <Fields
                          fields={editFields}
                          onChange={setEditFields}
                          disabled={isSaving}
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isSaving}
                            className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(pl.id)}
                            disabled={isSaving}
                            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-1.5 text-xs hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
                          >
                            {isSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
