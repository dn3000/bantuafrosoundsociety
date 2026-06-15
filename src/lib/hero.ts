// Hero items resolver: enriches `hero_items` rows by batch-fetching their
// polymorphic refs (submission | video | playlist | article) into a single
// display-ready shape. The same shape is used by the admin screen and (in H3)
// the public homepage hero, so the field set here is deliberately the lowest
// common denominator: imageUrl, title, subtitle, typeBadge, href.

import type { SupabaseClient } from '@supabase/supabase-js'

export type HeroRefType = 'submission' | 'video' | 'playlist' | 'article'

export type HeroItemRow = {
  id: string
  position: number
  ref_type: HeroRefType
  ref_id: string
  kicker: string | null
  headline: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export type ResolvedHeroItem = HeroItemRow & {
  imageUrl: string | null
  title: string
  subtitle: string | null
  typeBadge: string
  href: string
  refMissing: boolean
}

// ── Display helpers ──────────────────────────────────────────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function pickImage(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) if (isRenderableImage(c)) return c as string
  return null
}

const SUBMISSION_TYPE_BADGE: Record<string, string> = {
  release: 'ALBUM',
  single: 'SINGLE',
  mix: 'MIX',
  playlist: 'PLAYLIST',
  video: 'VIDEO',
  podcast: 'PODCAST',
  dj_set: 'DJ SET',
}

// ── Auto kicker/headline copy ────────────────────────────────────────────────
// Shared between the candidates endpoint (pre-fill the form) and any future
// caller that wants the default suggestion for a given ref.

export type AutoCopy = { autoKicker: string; autoHeadline: string }

export function submissionAutoCopy(
  type: string,
  title: string,
  artistName: string | null,
): AutoCopy {
  const headline = artistName ? `${artistName} — ${title}` : title
  if (type === 'release') return { autoKicker: 'NEW RELEASE', autoHeadline: headline }
  if (type === 'single') return { autoKicker: 'NEW SINGLE', autoHeadline: headline }
  const label = SUBMISSION_TYPE_BADGE[type] ?? type.toUpperCase()
  return { autoKicker: `NEW ${label}`, autoHeadline: headline }
}

export function videoAutoCopy(title: string): AutoCopy {
  return { autoKicker: 'WATCH', autoHeadline: title }
}

export function playlistAutoCopy(name: string | null): AutoCopy {
  return { autoKicker: 'PLAYLIST', autoHeadline: name ?? '(untitled playlist)' }
}

export function articleAutoCopy(title: string): AutoCopy {
  return { autoKicker: 'FEATURE', autoHeadline: title }
}

// ── Batch resolver ───────────────────────────────────────────────────────────

type SubmissionRow = {
  id: string
  title: string
  slug: string | null
  type: string
  artwork_url: string | null
  cover_image_url: string | null
  primary_artist_id: string | null
  artists: { name: string } | { name: string }[] | null
}
type VideoRow = {
  id: string
  title: string
  thumbnail_url: string | null
  category: string
  youtube_video_id: string
}
type PlaylistRow = {
  id: string
  name: string | null
  cover_image_url: string | null
  image_url: string | null
  curator_name: string | null
  owner_name: string | null
}
type ArticleRow = {
  id: string
  title: string
  slug: string
  cover_image_url: string | null
  author: string | null
  source_name: string | null
}

function artistOf(s: SubmissionRow): string | null {
  // PostgREST may return the embedded relation as either an object or a one-
  // element array depending on the relationship cardinality it infers.
  const a = s.artists
  if (!a) return null
  if (Array.isArray(a)) return a[0]?.name ?? null
  return a.name ?? null
}

export async function resolveHeroItems(
  supabase: SupabaseClient,
  items: HeroItemRow[],
): Promise<ResolvedHeroItem[]> {
  const idsByType: Record<HeroRefType, string[]> = {
    submission: [],
    video: [],
    playlist: [],
    article: [],
  }
  for (const it of items) idsByType[it.ref_type].push(it.ref_id)

  const [subRes, vidRes, playRes, artRes] = await Promise.all([
    idsByType.submission.length
      ? supabase
          .from('submissions')
          .select('id, title, slug, type, artwork_url, cover_image_url, primary_artist_id, artists(name)')
          .in('id', idsByType.submission)
      : Promise.resolve({ data: [] as SubmissionRow[], error: null }),
    idsByType.video.length
      ? supabase
          .from('videos')
          .select('id, title, thumbnail_url, category, youtube_video_id')
          .in('id', idsByType.video)
      : Promise.resolve({ data: [] as VideoRow[], error: null }),
    idsByType.playlist.length
      ? supabase
          .from('tracked_playlists')
          .select('id, name, cover_image_url, image_url, curator_name, owner_name')
          .in('id', idsByType.playlist)
      : Promise.resolve({ data: [] as PlaylistRow[], error: null }),
    idsByType.article.length
      ? supabase
          .from('articles')
          .select('id, title, slug, cover_image_url, author, source_name')
          .in('id', idsByType.article)
      : Promise.resolve({ data: [] as ArticleRow[], error: null }),
  ])

  const subMap = new Map<string, SubmissionRow>(
    ((subRes.data ?? []) as SubmissionRow[]).map((r) => [r.id, r]),
  )
  const vidMap = new Map<string, VideoRow>(
    ((vidRes.data ?? []) as VideoRow[]).map((r) => [r.id, r]),
  )
  const playMap = new Map<string, PlaylistRow>(
    ((playRes.data ?? []) as PlaylistRow[]).map((r) => [r.id, r]),
  )
  const artMap = new Map<string, ArticleRow>(
    ((artRes.data ?? []) as ArticleRow[]).map((r) => [r.id, r]),
  )

  return items.map((it): ResolvedHeroItem => {
    if (it.ref_type === 'submission') {
      const r = subMap.get(it.ref_id)
      if (!r) return missing(it, 'SUBMISSION')
      const artistName = artistOf(r)
      return {
        ...it,
        imageUrl: pickImage(r.artwork_url, r.cover_image_url),
        title: r.title,
        subtitle: artistName,
        typeBadge: SUBMISSION_TYPE_BADGE[r.type] ?? r.type.toUpperCase(),
        href: `/release/${r.id}`,
        refMissing: false,
      }
    }
    if (it.ref_type === 'video') {
      const r = vidMap.get(it.ref_id)
      if (!r) return missing(it, 'VIDEO')
      const ytThumb = r.youtube_video_id
        ? `https://i.ytimg.com/vi/${r.youtube_video_id}/hqdefault.jpg`
        : null
      return {
        ...it,
        imageUrl: pickImage(r.thumbnail_url, ytThumb),
        title: r.title,
        subtitle: r.category,
        typeBadge: 'WATCH',
        href: `/watch/${r.id}`,
        refMissing: false,
      }
    }
    if (it.ref_type === 'playlist') {
      const r = playMap.get(it.ref_id)
      if (!r) return missing(it, 'PLAYLIST')
      return {
        ...it,
        imageUrl: pickImage(r.cover_image_url, r.image_url),
        title: r.name ?? '(untitled playlist)',
        subtitle: r.curator_name ?? r.owner_name ?? null,
        typeBadge: 'PLAYLIST',
        href: `/playlist/${r.id}`,
        refMissing: false,
      }
    }
    // article
    const r = artMap.get(it.ref_id)
    if (!r) return missing(it, 'FEATURE')
    return {
      ...it,
      imageUrl: pickImage(r.cover_image_url),
      title: r.title,
      subtitle: r.author ?? r.source_name ?? null,
      typeBadge: 'FEATURE',
      href: `/read/${r.slug}`,
      refMissing: false,
    }
  })
}

function missing(it: HeroItemRow, typeBadge: string): ResolvedHeroItem {
  return {
    ...it,
    imageUrl: null,
    title: `(missing ${typeBadge.toLowerCase()})`,
    subtitle: null,
    typeBadge,
    href: '#',
    refMissing: true,
  }
}
