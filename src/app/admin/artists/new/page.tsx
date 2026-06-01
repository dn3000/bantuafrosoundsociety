'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SUBGENRE_OPTIONS = [
  'afro house', 'amapiano', '3-step', 'deep house', 'soulful house',
  'afro tech', 'tribal', 'broken beat', 'gqom', 'shangaan electro',
  'bacardi', 'sgubhu',
]

type Enrichment = {
  name: string
  bio: string | null
  imageUrl: string | null
  spotifyArtistId: string
  spotifyUrl: string | null
  spotifyFollowers: number
  spotifyPopularity: number
  spotifyGenres: string[]
  suggestedSubgenres: string[]
  suggestedCity: string | null
  suggestedCountry: string
  notes: string | null
}

export default function NewArtistPage() {
  const router = useRouter()

  const [enrichUrl, setEnrichUrl] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [enrichmentNote, setEnrichmentNote] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [tier, setTier] = useState('active')
  const [status, setStatus] = useState('active')
  const [isTracked, setIsTracked] = useState(true)
  const [country, setCountry] = useState('South Africa')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [subgenres, setSubgenres] = useState<string[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [spotifyArtistId, setSpotifyArtistId] = useState('')
  const [privateNotes, setPrivateNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSubgenre(s: string) {
    setSubgenres((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  async function handleEnrich(e: React.FormEvent) {
    e.preventDefault()
    if (!enrichUrl.trim()) return
    setEnriching(true)
    setEnrichError(null)
    setEnrichmentNote(null)
    try {
      const res = await fetch('/api/admin/artists/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: enrichUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Enrichment failed')
      }
      const e: Enrichment = data.enrichment
      // Prefill form fields
      setName(e.name)
      if (e.bio) setBio(e.bio)
      if (e.imageUrl) setImageUrl(e.imageUrl)
      setSpotifyArtistId(e.spotifyArtistId)
      if (e.suggestedCity) setCity(e.suggestedCity)
      if (e.suggestedCountry) setCountry(e.suggestedCountry)
      if (e.suggestedSubgenres.length > 0) {
        setSubgenres((prev) => Array.from(new Set([...prev, ...e.suggestedSubgenres])))
      }
      if (e.notes) {
        setPrivateNotes((prev) => (prev ? `${prev}\n\n${e.notes}` : e.notes!))
      }
      setEnrichmentNote(
        `Loaded from Spotify · ${e.spotifyFollowers.toLocaleString()} followers · popularity ${e.spotifyPopularity}/100`
      )
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setEnriching(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          tier,
          status,
          is_tracked: isTracked,
          country,
          city: city || undefined,
          bio: bio || undefined,
          subgenres,
          image_url: imageUrl || undefined,
          spotify_artist_id: spotifyArtistId || undefined,
          private_notes: privateNotes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create artist')
      router.push('/admin/artists')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <div className="max-w-2xl mx-auto p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Add Artist
          </h1>
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to artists
          </Link>
        </div>

        {/* Quick add from URL */}
        <form
          onSubmit={handleEnrich}
          className="mb-8 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5"
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
              Quick add from URL
            </h2>
            <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">
              Paste a Spotify artist URL — we&rsquo;ll fetch the metadata and pre-fill the form.
            </p>
          </div>
          <div className="flex gap-2 flex-col sm:flex-row">
            <input
              type="url"
              placeholder="https://open.spotify.com/artist/..."
              value={enrichUrl}
              onChange={(e) => setEnrichUrl(e.target.value)}
              className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
            />
            <button
              type="submit"
              disabled={enriching || !enrichUrl.trim()}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] text-sm font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {enriching ? 'Enriching…' : 'Enrich'}
            </button>
          </div>
          {enrichError && (
            <p className="text-xs text-[var(--color-error)] mt-2">{enrichError}</p>
          )}
          {enrichmentNote && (
            <p className="text-xs text-[var(--color-fg-secondary)] mt-2">{enrichmentNote}</p>
          )}
        </form>

        {/* Main form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Field label="Name *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Kususa"
            />
          </Field>

          {imageUrl && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={name || 'artist'}
                className="w-16 h-16 rounded-[var(--radius)] object-cover"
              />
              <div className="text-xs text-[var(--color-fg-tertiary)] flex-1 break-all">
                {imageUrl}
              </div>
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]"
              >
                Clear
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tier">
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className={inputClass}
              >
                <option value="featured">Featured</option>
                <option value="active">Active</option>
                <option value="watch">Watch</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="hiatus">Hiatus</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Country">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
                placeholder="e.g. Durban"
              />
            </Field>
          </div>

          <Field label="Subgenres">
            <div className="flex flex-wrap gap-2">
              {SUBGENRE_OPTIONS.map((s) => {
                const active = subgenres.includes(s)
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggleSubgenre(s)}
                    className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                      active
                        ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]'
                        : 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-elevated)]'
                    }`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Bio">
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={inputClass}
            />
          </Field>

          {privateNotes && (
            <Field label="Private notes (admin only)">
              <textarea
                rows={2}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          {spotifyArtistId && (
            <div className="text-xs text-[var(--color-fg-tertiary)]">
              Spotify Artist ID: <span className="font-mono">{spotifyArtistId}</span>
            </div>
          )}

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isTracked}
              onChange={(e) => setIsTracked(e.target.checked)}
              className="h-4 w-4"
            />
            <div>
              <span className="text-sm text-[var(--color-fg-primary)] font-medium">
                Actively tracked
              </span>
              <p className="text-xs text-[var(--color-fg-tertiary)]">
                Tracked artists are scraped for new releases. Uncheck to create a stub record only.
              </p>
            </div>
          </label>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting || !name}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Saving…' : 'Create artist'}
            </button>
          </div>

          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2.5 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-[var(--color-fg-secondary)] mb-1.5">{label}</span>
      {children}
    </label>
  )
}
