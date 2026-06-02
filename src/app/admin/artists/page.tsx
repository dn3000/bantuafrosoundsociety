'use client'

import { useEffect, useState, useCallback } from 'react'
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
  subgenres: string[]
  image_url: string | null
  updated_at: string
}

const PAGE_SIZE = 50

function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function isRenderableImage(imageUrl: string | null): boolean {
  if (!imageUrl) return false
  if (imageUrl === 'no_spotify_image') return false
  // Basic sanity check — must look like a URL
  return imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
}

function ArtistAvatar({ artist }: { artist: Artist }) {
  const renderable = isRenderableImage(artist.image_url)
  const initials = getInitials(artist.name)

  // Subtle tier-based background tint for placeholders
  const placeholderBg: Record<string, string> = {
    featured: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    active: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    watch: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }

  if (renderable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artist.image_url!}
        alt={artist.name}
        className="w-10 h-10 rounded-[var(--radius)] object-cover flex-shrink-0"
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`w-10 h-10 rounded-[var(--radius)] flex items-center justify-center text-xs font-semibold flex-shrink-0 ${placeholderBg[artist.tier]}`}
      aria-label={`${artist.name} placeholder`}
    >
      {initials}
    </div>
  )
}

export default function ArtistsListPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [trackedFilter, setTrackedFilter] = useState('')
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(total, (page + 1) * PAGE_SIZE)

  const fetchArtists = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tierFilter) params.set('tier', tierFilter)
    if (trackedFilter) params.set('tracked', trackedFilter)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    try {
      const res = await fetch(`/api/admin/artists?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setArtists(data.artists)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [search, tierFilter, trackedFilter, page])

  useEffect(() => {
    setPage(0)
  }, [search, tierFilter, trackedFilter])

  useEffect(() => {
    const t = setTimeout(fetchArtists, 250)
    return () => clearTimeout(t)
  }, [fetchArtists])

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Artists
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} {total === 1 ? 'artist' : 'artists'} in the scene graph
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Back to dashboard
            </Link>
            <Link
              href="/admin/artists/backfill"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              Backfill
            </Link>
            <Link
              href="/admin/artists/musicbrainz"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              MusicBrainz
            </Link>
            <Link
              href="/admin/artists/import"
              className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              Import from playlist
            </Link>
            <Link
              href="/admin/artists/new"
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Add artist
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="">All tiers</option>
            <option value="featured">Featured</option>
            <option value="active">Active</option>
            <option value="watch">Watch</option>
          </select>
          <select
            value={trackedFilter}
            onChange={(e) => setTrackedFilter(e.target.value)}
            className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors"
          >
            <option value="">All artists</option>
            <option value="true">Tracked only</option>
            <option value="false">Untracked stubs</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : artists.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)] mb-4">
              {total === 0 ? 'No artists yet.' : 'No artists match your filters.'}
            </p>
            {total === 0 && (
              <Link
                href="/admin/artists/new"
                className="inline-block bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Add the first artist
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 text-xs text-[var(--color-fg-tertiary)]">
              <span>
                Showing {showingFrom}–{showingTo} of {total}
              </span>
              <span>
                Page {page + 1} of {totalPages}
              </span>
            </div>

            <ul className="space-y-2">
              {artists.map((artist) => (
                <li key={artist.id}>
                  <Link
                    href={`/admin/artists/${artist.slug}`}
                    className="block bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-colors"
                  >
                  <div className="flex items-center gap-3">
                    <ArtistAvatar artist={artist} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--color-fg-primary)] truncate">
                          {artist.name}
                        </span>
                        <TierBadge tier={artist.tier} />
                        {artist.is_tracked ? (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-semibold">
                            tracked
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] font-semibold">
                            stub
                          </span>
                        )}
                        {artist.status !== 'active' && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] font-semibold">
                            {artist.status}
                          </span>
                        )}
                      </div>
                      {(artist.city || artist.country) && (
                        <p className="text-xs text-[var(--color-fg-secondary)] mt-0.5">
                          {[artist.city, artist.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  </Link>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-[var(--color-fg-tertiary)]">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: 'featured' | 'active' | 'watch' }) {
  const styles: Record<string, string> = {
    featured: 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]',
    active: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    watch: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${styles[tier]}`}>
      {tier}
    </span>
  )
}
