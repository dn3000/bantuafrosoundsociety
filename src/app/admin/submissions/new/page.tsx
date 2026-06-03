'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ArtistOption = {
  id: string
  name: string
  slug: string
  image_url: string | null
  tier: string
  city: string | null
  country: string | null
}

function isRenderableImage(url: string | null): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export default function NewSubmissionPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ArtistOption[]>([])
  const [selectedArtist, setSelectedArtist] = useState<ArtistOption | null>(null)
  const [title, setTitle] = useState('')
  const [submissionType, setSubmissionType] = useState('track')
  const [url, setUrl] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchArtists = useCallback(async () => {
    if (search.length < 2) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`/api/admin/artists/search?q=${encodeURIComponent(search)}`)
      const data = await res.json()
      if (res.ok) setResults(data.artists || [])
    } catch {}
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchArtists, 200)
    return () => clearTimeout(t)
  }, [fetchArtists])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedArtist) {
      setError('Pick an artist first')
      return
    }
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: selectedArtist.id,
          submission_type: submissionType,
          title,
          url,
          cover_image_url: coverImageUrl,
          description,
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      router.push(`/admin/submissions/${data.submission.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            New submission
          </h1>
          <Link
            href="/admin/submissions"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            ← Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Artist picker */}
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
            <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-2">
              Artist *
            </p>
            {selectedArtist ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isRenderableImage(selectedArtist.image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedArtist.image_url!}
                      alt={selectedArtist.name}
                      className="w-10 h-10 rounded-[var(--radius)] object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs">
                      {selectedArtist.name[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-[var(--color-fg-primary)]">{selectedArtist.name}</p>
                    <p className="text-xs text-[var(--color-fg-secondary)]">
                      {[selectedArtist.city, selectedArtist.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtist(null)
                    setSearch('')
                  }}
                  className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search artist by name…"
                  className={inputCls}
                />
                {results.length > 0 && (
                  <ul className="mt-3 space-y-1 max-h-72 overflow-y-auto">
                    {results.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArtist(a)
                            setSearch('')
                            setResults([])
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-[var(--radius)] hover:bg-[var(--color-bg-higher)] transition-colors text-left"
                        >
                          {isRenderableImage(a.image_url) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image_url!} alt={a.name} className="w-8 h-8 rounded-[var(--radius)] object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs">
                              {a.name[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--color-fg-primary)] truncate">{a.name}</p>
                            <p className="text-xs text-[var(--color-fg-secondary)]">{a.tier}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Title + type + url */}
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 space-y-4">
            <Field label="Title *">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={submissionType}
                onChange={(e) => setSubmissionType(e.target.value)}
                className={inputCls}
              >
                <option value="track">Track</option>
                <option value="release">Release / Album</option>
                <option value="mix">Mix</option>
                <option value="event">Event</option>
              </select>
            </Field>
            <Field label="URL (Spotify, YouTube, SoundCloud, etc.)">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/track/..."
                className={inputCls}
              />
            </Field>
            <Field label="Cover image URL (optional)">
              <input
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>
            <Field label="Editorial notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="Why is this worth featuring? Any context?"
              />
            </Field>
          </div>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/admin/submissions"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-2 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving…' : 'Add submission'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-1">{label}</div>
      {children}
    </label>
  )
}
