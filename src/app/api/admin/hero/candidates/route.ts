import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  articleAutoCopy,
  playlistAutoCopy,
  submissionAutoCopy,
  videoAutoCopy,
  type HeroRefType,
} from '@/lib/hero'

const ALLOWED_REF_TYPES: HeroRefType[] = ['submission', 'video', 'playlist', 'article']
const CANDIDATE_LIMIT = 50

type Candidate = {
  ref_id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  autoKicker: string
  autoHeadline: string
}

function isRenderable(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function pickImage(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) if (isRenderable(c)) return c as string
  return null
}

export async function GET(request: Request) {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get('type') ?? ''
  if (!ALLOWED_REF_TYPES.includes(typeParam as HeroRefType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  const refType = typeParam as HeroRefType
  const q = (searchParams.get('q') ?? '').trim()

  let candidates: Candidate[] = []

  if (refType === 'submission') {
    let query = supabase
      .from('submissions')
      .select('id, title, type, artwork_url, cover_image_url, release_date, artists(name)')
      .eq('status', 'approved')
      .order('release_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT)
    if (q) query = query.ilike('title', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    candidates = ((data ?? []) as Array<{
      id: string
      title: string
      type: string
      artwork_url: string | null
      cover_image_url: string | null
      release_date: string | null
      artists: { name: string } | { name: string }[] | null
    }>).map((s) => {
      const a = s.artists
      const artistName = Array.isArray(a) ? (a[0]?.name ?? null) : (a?.name ?? null)
      const { autoKicker, autoHeadline } = submissionAutoCopy(s.type, s.title, artistName)
      return {
        ref_id: s.id,
        title: s.title,
        subtitle: artistName ? `${artistName} · ${s.type}` : s.type,
        imageUrl: pickImage(s.artwork_url, s.cover_image_url),
        autoKicker,
        autoHeadline,
      }
    })
  } else if (refType === 'video') {
    let query = supabase
      .from('videos')
      .select('id, title, category, thumbnail_url, youtube_video_id, published_at')
      .eq('status', 'approved')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT)
    if (q) query = query.ilike('title', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    candidates = ((data ?? []) as Array<{
      id: string
      title: string
      category: string
      thumbnail_url: string | null
      youtube_video_id: string | null
      published_at: string | null
    }>).map((v) => {
      const { autoKicker, autoHeadline } = videoAutoCopy(v.title)
      const ytThumb = v.youtube_video_id
        ? `https://i.ytimg.com/vi/${v.youtube_video_id}/hqdefault.jpg`
        : null
      return {
        ref_id: v.id,
        title: v.title,
        subtitle: v.category,
        imageUrl: pickImage(v.thumbnail_url, ytThumb),
        autoKicker,
        autoHeadline,
      }
    })
  } else if (refType === 'playlist') {
    let query = supabase
      .from('tracked_playlists')
      .select('id, name, cover_image_url, image_url, curator_name, owner_name, display_order')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .limit(CANDIDATE_LIMIT)
    if (q) query = query.ilike('name', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    candidates = ((data ?? []) as Array<{
      id: string
      name: string | null
      cover_image_url: string | null
      image_url: string | null
      curator_name: string | null
      owner_name: string | null
    }>).map((p) => {
      const curator = p.curator_name ?? p.owner_name ?? null
      const { autoKicker, autoHeadline } = playlistAutoCopy(p.name)
      return {
        ref_id: p.id,
        title: p.name ?? '(untitled playlist)',
        subtitle: curator,
        imageUrl: pickImage(p.cover_image_url, p.image_url),
        autoKicker,
        autoHeadline,
      }
    })
  } else if (refType === 'article') {
    let query = supabase
      .from('articles')
      .select('id, title, slug, cover_image_url, author, source_name, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_LIMIT)
    if (q) query = query.ilike('title', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    candidates = ((data ?? []) as Array<{
      id: string
      title: string
      slug: string
      cover_image_url: string | null
      author: string | null
      source_name: string | null
      published_at: string | null
    }>).map((a) => {
      const { autoKicker, autoHeadline } = articleAutoCopy(a.title)
      return {
        ref_id: a.id,
        title: a.title,
        subtitle: a.author ?? a.source_name ?? null,
        imageUrl: pickImage(a.cover_image_url),
        autoKicker,
        autoHeadline,
      }
    })
  }

  return NextResponse.json({ candidates })
}
