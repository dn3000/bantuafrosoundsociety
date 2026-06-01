'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const SUBGENRE_OPTIONS = [
  'afro house', 'amapiano', '3-step', 'deep house', 'soulful house',
  'afro tech', 'tribal', 'broken beat', 'gqom', 'shangaan electro',
  'bacardi', 'sgubhu',
]

export default function NewArtistPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [tier, setTier] = useState('active')
  const [status, setStatus] = useState('active')
  const [isTracked, setIsTracked] = useState(true)
  const [country, setCountry] = useState('South Africa')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [subgenres, setSubgenres] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSubgenre(s: string) {
    setSubgenres((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
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

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}
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
