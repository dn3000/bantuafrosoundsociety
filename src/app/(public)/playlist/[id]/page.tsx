export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

type PlaylistDetail = {
  id: string
  spotify_playlist_id: string
  name: string | null
  curator_name: string | null
  description: string | null
  cover_image_url: string | null
  image_url: string | null
  is_published: boolean
}

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getCoverSrc(pl: PlaylistDetail): string | null {
  if (isRenderableImage(pl.cover_image_url)) return pl.cover_image_url!
  if (isRenderableImage(pl.image_url)) return pl.image_url!
  return null
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

async function fetchPlaylist(id: string): Promise<PlaylistDetail | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tracked_playlists')
    .select(
      'id, spotify_playlist_id, name, curator_name, description, cover_image_url, image_url, is_published'
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) return null
  const pl = data as PlaylistDetail
  if (!pl.is_published) return null
  return pl
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const pl = await fetchPlaylist(id)
  if (!pl) return { title: 'Playlist not found | BASS' }
  return {
    title: `${pl.name ?? 'Playlist'} | BASS`,
    description: pl.description
      ? pl.description
      : pl.curator_name
        ? `A playlist curated by ${pl.curator_name}.`
        : undefined,
  }
}

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pl = await fetchPlaylist(id)
  if (!pl) notFound()

  const coverSrc = getCoverSrc(pl)
  const spotifyUrl = `https://open.spotify.com/playlist/${pl.spotify_playlist_id}`
  const embedUrl = `https://open.spotify.com/embed/playlist/${pl.spotify_playlist_id}`

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)] mb-8"
      >
        <span className="text-[var(--color-accent)]" aria-hidden>←</span>
        Back to home
      </Link>

      {/* Hero */}
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-10">
        {/* Cover */}
        <div className="sm:w-[400px] sm:flex-shrink-0">
          <div className="aspect-square w-full sm:max-w-[400px] rounded-[8px] overflow-hidden">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSrc}
                alt={pl.name ?? 'Playlist cover'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-3xl select-none">
                {getInitials(pl.name ?? 'Playlist')}
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex-1 flex flex-col">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
            Playlist
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2">
            {pl.name ?? 'Untitled Playlist'}
          </h1>
          {pl.curator_name && (
            <p className="text-[var(--color-fg-secondary)] text-lg mb-4">{pl.curator_name}</p>
          )}
          {pl.description && (
            <p className="text-sm text-[var(--color-fg-secondary)] mb-6 leading-relaxed">
              {pl.description}
            </p>
          )}

          {/* Open on Spotify — Spotify design policy requires cover art and embeds
              to link back. This external link satisfies that requirement. */}
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 hover:bg-[var(--color-accent)] hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]"
          >
            Open on Spotify ↗
          </a>
        </div>
      </section>

      {/* Spotify embed — renders the tracklist client-side; no /items API call.
          Spotify's design policy requires a link back to Spotify alongside embeds;
          the "Open on Spotify" button above satisfies that requirement. */}
      <section className="rounded-[8px] overflow-hidden">
        <iframe
          src={embedUrl}
          width="100%"
          height="380"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="block w-full rounded-[8px] overflow-hidden"
          title={`${pl.name ?? 'Playlist'} on Spotify`}
        />
      </section>
    </div>
  )
}
