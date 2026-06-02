import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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
  spotify_genres: string[] | null
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
  source_method: string | null
  last_release_date: string | null
  last_contact_date: string | null
  created_at: string
  updated_at: string
}

export const dynamic = 'force-dynamic'

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

function isRealMbId(id: string | null): boolean {
  if (!id) return false
  if (id === 'not_in_musicbrainz') return false
  return true
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: artist, error } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !artist) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm text-[var(--color-error)]">
            {error?.message || 'Artist not found'}
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

  const a = artist as Artist
  const renderable = isRenderableImage(a.image_url)
  const initials = getInitials(a.name)
  const hasMb = isRealMbId(a.musicbrainz_artist_id)
  const location = [a.city, a.country].filter(Boolean).join(', ')

  const noteLines = (a.private_notes || '').split('\n').filter((l) => l.trim().length > 0)

  const hasPlatforms = !!(a.spotify_artist_id || hasMb || a.discogs_url || a.wikipedia_url || (a.spotify_genres && a.spotify_genres.length > 0))
  const hasSocials = !!(a.website_url || a.instagram_handle || a.twitter_handle || a.tiktok_handle || a.facebook_url)
  const hasMusicPlatforms = !!(a.bandcamp_url || a.soundcloud_url || a.youtube_url)

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <div className="max-w-4xl mx-auto p-6 sm:p-10">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            ← Back to artists
          </Link>
          <Link
            href={`/admin/artists/${a.slug}/edit`}
            className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          >
            Edit artist
          </Link>
        </div>

        {/* Hero */}
        <div className="flex items-start gap-6 mb-8 flex-wrap sm:flex-nowrap">
          {renderable ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.image_url!}
              alt={a.name}
              className="w-32 h-32 sm:w-48 sm:h-48 rounded-[var(--radius-md)] object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[var(--radius-md)] bg-[var(--color-bg-higher)] flex items-center justify-center text-3xl sm:text-4xl font-semibold text-[var(--color-fg-secondary)] flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-fg-primary)] mb-2">
              {a.name}
            </h1>
            {location && (
              <p className="text-base text-[var(--color-fg-secondary)] mb-3">{location}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Badge variant={a.tier === 'featured' ? 'accent' : 'neutral'}>
                {a.tier}
              </Badge>
              {a.is_tracked ? (
                <Badge variant="accent-subtle">tracked</Badge>
              ) : (
                <Badge variant="neutral">stub</Badge>
              )}
              {a.status !== 'active' && (
                <Badge variant="neutral">{a.status}</Badge>
              )}
              {a.relationship_status && (
                <Badge variant="neutral">{a.relationship_status}</Badge>
              )}
            </div>
            {a.bio && (
              <p className="text-sm text-[var(--color-fg-secondary)] leading-relaxed">
                {a.bio}
              </p>
            )}
            {a.subgenres && a.subgenres.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {a.subgenres.map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Platforms */}
        {hasPlatforms && (
          <Card title="Platforms">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {a.spotify_artist_id && (
                <LinkRow
                  label="Spotify"
                  href={`https://open.spotify.com/artist/${a.spotify_artist_id}`}
                  display="Open profile"
                  monoId={a.spotify_artist_id}
                />
              )}
              {hasMb && (
                <LinkRow
                  label="MusicBrainz"
                  href={`https://musicbrainz.org/artist/${a.musicbrainz_artist_id}`}
                  display="Open profile"
                  monoId={a.musicbrainz_artist_id!}
                />
              )}
              {a.discogs_url && (
                <LinkRow label="Discogs" href={a.discogs_url} display="Open page" />
              )}
              {a.wikipedia_url && (
                <LinkRow label="Wikipedia" href={a.wikipedia_url} display="Open article" />
              )}
            </div>
            {a.spotify_genres && a.spotify_genres.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)]">
                <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-2">
                  Spotify genres
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.spotify_genres.map((g) => (
                    <span
                      key={g}
                      className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Socials */}
        {hasSocials && (
          <Card title="Socials">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {a.website_url && (
                <LinkRow label="Website" href={a.website_url} display={a.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')} />
              )}
              {a.instagram_handle && (
                <LinkRow
                  label="Instagram"
                  href={`https://instagram.com/${a.instagram_handle}`}
                  display={`@${a.instagram_handle}`}
                />
              )}
              {a.twitter_handle && (
                <LinkRow
                  label="Twitter / X"
                  href={`https://x.com/${a.twitter_handle}`}
                  display={`@${a.twitter_handle}`}
                />
              )}
              {a.tiktok_handle && (
                <LinkRow
                  label="TikTok"
                  href={`https://tiktok.com/@${a.tiktok_handle}`}
                  display={`@${a.tiktok_handle}`}
                />
              )}
              {a.facebook_url && (
                <LinkRow label="Facebook" href={a.facebook_url} display="Open page" />
              )}
            </div>
          </Card>
        )}

        {/* Music platforms */}
        {hasMusicPlatforms && (
          <Card title="Music platforms">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {a.bandcamp_url && (
                <LinkRow label="Bandcamp" href={a.bandcamp_url} display="Open page" />
              )}
              {a.soundcloud_url && (
                <LinkRow label="SoundCloud" href={a.soundcloud_url} display="Open page" />
              )}
              {a.youtube_url && (
                <LinkRow label="YouTube" href={a.youtube_url} display="Open channel" />
              )}
            </div>
          </Card>
        )}

        {/* Editorial / Audit */}
        <Card title="Editorial">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
            <Stat label="Added" value={formatDate(a.created_at) || '—'} />
            <Stat label="Updated" value={formatDate(a.updated_at) || '—'} />
            <Stat label="Source" value={a.source_method || '—'} />
            <Stat label="Last release" value={formatDate(a.last_release_date) || '—'} />
          </div>
          {noteLines.length > 0 && (
            <div className="pt-4 border-t border-[var(--color-border-subtle)]">
              <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-2">
                Private notes
              </p>
              <pre className="text-xs text-[var(--color-fg-secondary)] font-mono whitespace-pre-wrap leading-relaxed">
                {noteLines.join('\n')}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'accent' | 'accent-subtle' | 'neutral'
}) {
  const styles: Record<typeof variant, string> = {
    accent: 'bg-[var(--color-accent)] text-[var(--color-fg-primary)]',
    'accent-subtle': 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    neutral: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${styles[variant]}`}>
      {children}
    </span>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-4">
      <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}

function LinkRow({
  label,
  href,
  display,
  monoId,
}: {
  label: string
  href: string
  display: string
  monoId?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider">
          {label}
        </p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[var(--color-accent)] hover:underline truncate block"
        >
          {display}
        </a>
        {monoId && (
          <p className="text-[10px] text-[var(--color-fg-tertiary)] font-mono truncate">
            {monoId}
          </p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-sm text-[var(--color-fg-primary)]">{value}</p>
    </div>
  )
}
