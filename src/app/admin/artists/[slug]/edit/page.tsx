'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Artist = {
  id: string
  name: string
  slug: string
  tier: 'featured' | 'active' | 'watch'
  status: 'active' | 'inactive' | 'hiatus'
  is_tracked: boolean
  country: string | null
  city: string | null
  bio: string | null
  subgenres: string[] | null
  image_url: string | null
  relationship_status: string | null
  website_url: string | null
  instagram_handle: string | null
  twitter_handle: string | null
  tiktok_handle: string | null
  facebook_url: string | null
  bandcamp_url: string | null
  soundcloud_url: string | null
  discogs_url: string | null
  wikipedia_url: string | null
  youtube_url: string | null
  spotify_artist_id: string | null
  musicbrainz_artist_id: string | null
  private_notes: string | null
  last_release_date: string | null
  last_contact_date: string | null
}

const TIER_ORDER = ['watch', 'active', 'featured'] as const

function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function isRenderableImage(url: string | null): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export default function EditArtistPage() {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [artist, setArtist] = useState<Artist | null>(null)
  const [formData, setFormData] = useState<Partial<Artist>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [quickActionStatus, setQuickActionStatus] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    bio: true,
    platforms: true,
    socials: true,
    musicPlatforms: false,
    editorial: false,
  })

  const loadArtist = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/artists/${slug}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setArtist(data.artist)
      setFormData(data.artist)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadArtist()
  }, [loadArtist])

  async function quickAction(updates: Partial<Artist>, label: string) {
    setQuickActionStatus(`${label}…`)
    try {
      const res = await fetch(`/api/admin/artists/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setArtist(data.artist)
      setFormData((prev) => ({ ...prev, ...updates }))
      setQuickActionStatus(`${label} ✓`)
      setTimeout(() => setQuickActionStatus(null), 1500)
    } catch (err) {
      setQuickActionStatus(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
      setTimeout(() => setQuickActionStatus(null), 3000)
    }
  }

  function promoteTier() {
    if (!artist) return
    const currentIdx = TIER_ORDER.indexOf(artist.tier)
    if (currentIdx === -1 || currentIdx === TIER_ORDER.length - 1) return
    const nextTier = TIER_ORDER[currentIdx + 1]
    quickAction({ tier: nextTier }, `Promoted to ${nextTier}`)
  }

  function demoteTier() {
    if (!artist) return
    const currentIdx = TIER_ORDER.indexOf(artist.tier)
    if (currentIdx <= 0) return
    const nextTier = TIER_ORDER[currentIdx - 1]
    quickAction({ tier: nextTier }, `Demoted to ${nextTier}`)
  }

  function toggleTracked() {
    if (!artist) return
    quickAction({ is_tracked: !artist.is_tracked }, artist.is_tracked ? 'Untracked' : 'Tracked')
  }

  function changeStatus(status: string) {
    quickAction({ status: status as Artist['status'] }, `Status: ${status}`)
  }

  async function handleSave() {
    if (!formData) return
    setSaveStatus('saving')
    setError(null)
    try {
      // Build clean payload — exclude fields that don't change or are read-only
      const payload: Record<string, unknown> = {}
      const editable: Array<keyof Artist> = [
        'name', 'country', 'city', 'bio', 'relationship_status',
        'website_url', 'instagram_handle', 'twitter_handle', 'tiktok_handle', 'facebook_url',
        'bandcamp_url', 'soundcloud_url', 'discogs_url', 'wikipedia_url', 'youtube_url',
        'spotify_artist_id', 'musicbrainz_artist_id',
        'private_notes',
      ]
      for (const key of editable) {
        if (formData[key] !== artist?.[key]) {
          payload[key] = formData[key]
        }
      }

      // Subgenres: convert array back to string if changed
      if (formData.subgenres && JSON.stringify(formData.subgenres) !== JSON.stringify(artist?.subgenres)) {
        payload.subgenres = formData.subgenres
      }

      if (Object.keys(payload).length === 0) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
        return
      }

      const res = await fetch(`/api/admin/artists/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setArtist(data.artist)
      setFormData(data.artist)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSaveStatus('error')
    }
  }

  function handleDiscard() {
    if (artist) setFormData(artist)
    setError(null)
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function updateField<K extends keyof Artist>(key: K, value: Artist[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        </div>
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-[var(--color-error)]">
            {error || 'Artist not found'}
          </p>
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-accent)] hover:underline mt-4 inline-block"
          >
            ← Back to artists
          </Link>
        </div>
      </div>
    )
  }

  const renderable = isRenderableImage(artist.image_url)
  const initials = getInitials(artist.name)
  const tierIdx = TIER_ORDER.indexOf(artist.tier)
  const canPromote = tierIdx !== -1 && tierIdx < TIER_ORDER.length - 1
  const canDemote = tierIdx > 0

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {renderable ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.image_url!}
                alt={artist.name}
                className="w-16 h-16 rounded-[var(--radius-md)] object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-[var(--radius-md)] bg-[var(--color-bg-higher)] flex items-center justify-center text-base font-semibold text-[var(--color-fg-secondary)]">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg-primary)]">
                {artist.name}
              </h1>
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-1 font-mono">
                {artist.slug}
              </p>
            </div>
          </div>
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            ← Back to artists
          </Link>
        </header>

        {/* Quick actions strip */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider">Tier</span>
              <button
                type="button"
                onClick={demoteTier}
                disabled={!canDemote}
                className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2.5 py-1 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Demote tier"
              >
                ↓
              </button>
              <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold bg-[var(--color-bg-higher)] text-[var(--color-fg-primary)] min-w-[70px] text-center">
                {artist.tier}
              </span>
              <button
                type="button"
                onClick={promoteTier}
                disabled={!canPromote}
                className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2.5 py-1 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Promote tier"
              >
                ↑
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider">Tracked</span>
              <button
                type="button"
                onClick={toggleTracked}
                className={`text-xs uppercase tracking-wider px-3 py-1 rounded font-semibold transition-colors ${
                  artist.is_tracked
                    ? 'bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)]'
                    : 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)]'
                }`}
              >
                {artist.is_tracked ? 'Tracked' : 'Untracked'}
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider">Status</span>
              <select
                value={artist.status}
                onChange={(e) => changeStatus(e.target.value)}
                className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1 text-xs text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="hiatus">Hiatus</option>
              </select>
            </div>

            {quickActionStatus && (
              <span className="text-xs text-[var(--color-fg-secondary)] ml-auto">
                {quickActionStatus}
              </span>
            )}
          </div>
        </div>

        {/* Form sections */}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          <Section
            title="Identity"
            sectionKey="identity"
            expanded={expandedSections.identity}
            onToggle={() => toggleSection('identity')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Relationship status">
                <select
                  value={formData.relationship_status || ''}
                  onChange={(e) => updateField('relationship_status', e.target.value || null)}
                  className={inputCls}
                >
                  <option value="">(not set)</option>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="friend">Friend</option>
                  <option value="collaborator">Collaborator</option>
                </select>
              </Field>
              <Field label="Country">
                <input
                  type="text"
                  value={formData.country || ''}
                  onChange={(e) => updateField('country', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => updateField('city', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Bio & subgenres"
            sectionKey="bio"
            expanded={expandedSections.bio}
            onToggle={() => toggleSection('bio')}
          >
            <Field label="Bio">
              <textarea
                value={formData.bio || ''}
                onChange={(e) => updateField('bio', e.target.value)}
                rows={4}
                className={`${inputCls} font-sans`}
              />
            </Field>
            <Field label="Subgenres (comma-separated)">
              <input
                type="text"
                value={Array.isArray(formData.subgenres) ? formData.subgenres.join(', ') : ''}
                onChange={(e) =>
                  updateField(
                    'subgenres',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                className={inputCls}
                placeholder="afro house, deep house, soulful"
              />
            </Field>
          </Section>

          <Section
            title="Platform IDs"
            sectionKey="platforms"
            expanded={expandedSections.platforms}
            onToggle={() => toggleSection('platforms')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Spotify Artist ID"
                hint={
                  formData.spotify_artist_id ? (
                    <a
                      href={`https://open.spotify.com/artist/${formData.spotify_artist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Open on Spotify ↗
                    </a>
                  ) : null
                }
              >
                <input
                  type="text"
                  value={formData.spotify_artist_id || ''}
                  onChange={(e) => updateField('spotify_artist_id', e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                />
              </Field>
              <Field
                label="MusicBrainz Artist ID"
                hint={
                  formData.musicbrainz_artist_id &&
                  formData.musicbrainz_artist_id !== 'not_in_musicbrainz' ? (
                    <a
                      href={`https://musicbrainz.org/artist/${formData.musicbrainz_artist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      Open on MusicBrainz ↗
                    </a>
                  ) : null
                }
              >
                <input
                  type="text"
                  value={formData.musicbrainz_artist_id || ''}
                  onChange={(e) => updateField('musicbrainz_artist_id', e.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                />
              </Field>
              <Field label="Discogs URL">
                <input
                  type="url"
                  value={formData.discogs_url || ''}
                  onChange={(e) => updateField('discogs_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Wikipedia URL">
                <input
                  type="url"
                  value={formData.wikipedia_url || ''}
                  onChange={(e) => updateField('wikipedia_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Social handles"
            sectionKey="socials"
            expanded={expandedSections.socials}
            onToggle={() => toggleSection('socials')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Website">
                <input
                  type="url"
                  value={formData.website_url || ''}
                  onChange={(e) => updateField('website_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Instagram handle">
                <input
                  type="text"
                  value={formData.instagram_handle || ''}
                  onChange={(e) => updateField('instagram_handle', e.target.value.replace(/^@/, ''))}
                  placeholder="(without @)"
                  className={inputCls}
                />
              </Field>
              <Field label="Twitter/X handle">
                <input
                  type="text"
                  value={formData.twitter_handle || ''}
                  onChange={(e) => updateField('twitter_handle', e.target.value.replace(/^@/, ''))}
                  placeholder="(without @)"
                  className={inputCls}
                />
              </Field>
              <Field label="TikTok handle">
                <input
                  type="text"
                  value={formData.tiktok_handle || ''}
                  onChange={(e) => updateField('tiktok_handle', e.target.value.replace(/^@/, ''))}
                  placeholder="(without @)"
                  className={inputCls}
                />
              </Field>
              <Field label="Facebook URL">
                <input
                  type="url"
                  value={formData.facebook_url || ''}
                  onChange={(e) => updateField('facebook_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Music platforms"
            sectionKey="musicPlatforms"
            expanded={expandedSections.musicPlatforms}
            onToggle={() => toggleSection('musicPlatforms')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Bandcamp URL">
                <input
                  type="url"
                  value={formData.bandcamp_url || ''}
                  onChange={(e) => updateField('bandcamp_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="SoundCloud URL">
                <input
                  type="url"
                  value={formData.soundcloud_url || ''}
                  onChange={(e) => updateField('soundcloud_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="YouTube URL">
                <input
                  type="url"
                  value={formData.youtube_url || ''}
                  onChange={(e) => updateField('youtube_url', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Editorial notes"
            sectionKey="editorial"
            expanded={expandedSections.editorial}
            onToggle={() => toggleSection('editorial')}
          >
            <Field label="Private notes (audit + your observations)">
              <textarea
                value={formData.private_notes || ''}
                onChange={(e) => updateField('private_notes', e.target.value)}
                rows={8}
                className={`${inputCls} font-mono text-xs`}
              />
            </Field>
          </Section>

          {/* Save bar */}
          <div className="sticky bottom-4 z-10 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 flex items-center justify-between shadow-lg border border-[var(--color-border-subtle)]">
            <div className="text-xs">
              {saveStatus === 'saving' && <span className="text-[var(--color-fg-secondary)]">Saving…</span>}
              {saveStatus === 'saved' && <span className="text-[var(--color-success)]">✓ Saved</span>}
              {saveStatus === 'error' && (
                <span className="text-[var(--color-error)]">Error: {error}</span>
              )}
              {saveStatus === 'idle' && <span className="text-[var(--color-fg-tertiary)]">Unsaved changes will be lost</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] text-sm font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
              >
                {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

function Section({
  title,
  sectionKey,
  expanded,
  onToggle,
  children,
}: {
  title: string
  sectionKey: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[var(--color-bg-higher)] transition-colors"
      >
        <span className="text-sm font-semibold text-[var(--color-fg-primary)]">{title}</span>
        <span className="text-xs text-[var(--color-fg-tertiary)]">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider">
          {label}
        </span>
        {hint && <div className="text-xs">{hint}</div>}
      </div>
      {children}
    </label>
  )
}
