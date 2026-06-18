'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArtistPicker, type ArtistLite } from './ArtistPicker'

const CATEGORIES = ['mix', 'live_set', 'live_show', 'music_video', 'interview', 'other'] as const
const CATEGORY_LABELS: Record<string, string> = {
  mix: 'Mix',
  live_set: 'Live Set',
  live_show: 'Live Show / BASS Set',
  music_video: 'Music Video',
  interview: 'Interview / Podcast',
  other: 'Other',
}

type FreshResolve = {
  exists: false
  videoId: string
  title: string
  thumbnailUrl: string | null
  publishedAt: string | null
  channelTitle: string
  suggestedCategory: string
  suggestedArtist: ArtistLite | null
  metadataSource: 'data_api' | 'oembed'
}

type DupInfo = { id: string; status?: string; category?: string; message: string }

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2.5 py-1.5 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

export function PasteLinkSection({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<FreshResolve | null>(null)
  const [dup, setDup] = useState<DupInfo | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // Editable form (hydrated from a fresh resolve).
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('other')
  const [isExclusive, setIsExclusive] = useState(false)
  const [artist, setArtist] = useState<ArtistLite | null>(null)
  const [status, setStatus] = useState<'approved' | 'pending'>('pending')
  const [saving, setSaving] = useState(false)

  function resetResult() {
    setFresh(null)
    setDup(null)
    setError(null)
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || resolving) return
    setResolving(true)
    resetResult()
    setSavedMsg(null)
    try {
      const res = await fetch('/api/admin/videos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not resolve that link.')
        return
      }
      if (data.exists) {
        setDup({
          id: data.video.id,
          status: data.video.status,
          category: data.video.category,
          message: 'This video is already in the system.',
        })
        return
      }
      const f = data as FreshResolve
      setFresh(f)
      setTitle(f.title)
      setCategory(f.suggestedCategory || 'other')
      setIsExclusive(false)
      setArtist(f.suggestedArtist ?? null)
      setStatus('pending')
    } catch {
      setError('Network error resolving link.')
    } finally {
      setResolving(false)
    }
  }

  async function handleSave() {
    if (!fresh || saving) return
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_video_id: fresh.videoId,
          title: title.trim(),
          category,
          status,
          is_exclusive: isExclusive,
          artist_id: artist?.id ?? null,
          thumbnail_url: fresh.thumbnailUrl,
          published_at: fresh.publishedAt,
          source_method: 'paste',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setFresh(null)
        setDup({ id: data.video_id, message: data.message ?? 'A video with this ID already exists.' })
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Could not save video.')
        return
      }
      setSavedMsg(
        `Saved "${title.trim()}" as ${status === 'approved' ? 'Approved — live now' : 'Pending — in review queue'}.`,
      )
      setFresh(null)
      setUrl('')
      setArtist(null)
      onSaved()
    } catch {
      setError('Network error saving video.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
      <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-1">Paste a YouTube link</h2>
      <p className="text-xs text-[var(--color-fg-secondary)] mb-3">
        Add a single video by URL. We fetch the title, channel, and thumbnail, then you choose whether it
        goes live now or into the review queue.
      </p>

      <form onSubmit={handleResolve} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…  ·  youtu.be/…  ·  shorts/…"
          className={`${inputCls} flex-1 min-w-[260px]`}
        />
        <button
          type="submit"
          disabled={resolving || !url.trim()}
          className="text-sm font-semibold rounded-[var(--radius)] px-4 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
        >
          {resolving ? 'Fetching…' : 'Fetch details'}
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-[var(--color-error)]">{error}</p>}
      {savedMsg && <p className="mt-3 text-xs text-[var(--color-success)]">{savedMsg}</p>}

      {dup && (
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--color-border-default)] p-4">
          <p className="text-sm text-[var(--color-fg-primary)] font-medium">{dup.message}</p>
          {dup.status && (
            <p className="text-xs text-[var(--color-fg-secondary)] mt-0.5">
              Current status: <span className="font-semibold">{dup.status}</span>
              {dup.category ? ` · ${dup.category}` : ''}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Link
              href={`/admin/videos#video-${dup.id}`}
              className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
            >
              Edit it in the list below →
            </Link>
            <button
              type="button"
              onClick={() => {
                setDup(null)
                setUrl('')
              }}
              className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {fresh && (
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--color-border-default)] p-4">
          <div className="flex gap-4">
            <div className="w-40 aspect-video flex-shrink-0 rounded-[var(--radius)] overflow-hidden bg-[var(--color-bg-higher)]">
              {fresh.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fresh.thumbnailUrl} alt={fresh.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--color-fg-tertiary)] text-xs">
                  No thumbnail
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)] mb-1">
                  Title
                </label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                <p className="text-[11px] text-[var(--color-fg-tertiary)] mt-1">
                  {fresh.channelTitle ? `${fresh.channelTitle} · ` : ''}
                  metadata via {fresh.metadataSource === 'data_api' ? 'YouTube Data API' : 'oEmbed (no publish date)'}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-[10px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)] mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1.5 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--color-fg-secondary)] pb-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExclusive}
                    onChange={(e) => setIsExclusive(e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  Exclusive
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)] mb-1">
                  Artist {fresh.suggestedArtist ? '(roster match)' : '(no match — pick one if applicable)'}
                </label>
                <ArtistPicker value={artist} onChange={setArtist} />
              </div>

              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)] mb-1">
                  Publish as
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('pending')}
                    className={`text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border transition-colors ${
                      status === 'pending'
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                        : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                    }`}
                  >
                    Pending — review queue
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('approved')}
                    className={`text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border transition-colors ${
                      status === 'approved'
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                        : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                    }`}
                  >
                    Approved — live now
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                  className="text-sm font-semibold rounded-[var(--radius)] px-4 py-1.5 bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save video'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFresh(null)
                    setUrl('')
                  }}
                  className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
