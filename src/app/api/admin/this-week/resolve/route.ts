import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FETCH_TIMEOUT_MS = 6000
const USER_AGENT =
  'BASS-AdminBot/1.0 (+https://bantuafrosoundsociety.com; admin link resolver)'

type Resolved = {
  title: string
  artist: string
  artwork: string
  sourceUrl: string
}

function emptyResolved(sourceUrl: string): Resolved {
  return { title: '', artist: '', artwork: '', sourceUrl }
}

function isHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
    })
  } finally {
    clearTimeout(t)
  }
}

async function fetchOEmbed(endpoint: string, sourceUrl: string): Promise<Resolved | null> {
  try {
    const res = await fetchWithTimeout(endpoint)
    if (!res.ok) return null
    const data = (await res.json()) as {
      title?: unknown
      author_name?: unknown
      thumbnail_url?: unknown
    }
    return {
      title: typeof data.title === 'string' ? data.title : '',
      artist: typeof data.author_name === 'string' ? data.author_name : '',
      artwork: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : '',
      sourceUrl,
    }
  } catch {
    return null
  }
}

// Single-track Spotify titles come through as "Track Name" with author_name set
// to the artist; album/playlist oEmbed has author_name = "Spotify" so artist
// stays blank — that's fine, the admin will fill it in.
async function resolveSpotify(u: URL): Promise<Resolved | null> {
  const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(u.toString())}`
  return fetchOEmbed(endpoint, u.toString())
}

async function resolveYouTube(u: URL): Promise<Resolved | null> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.toString())}`
  return fetchOEmbed(endpoint, u.toString())
}

// Tiny OG/twitter parser — pulls property|name + content out of <meta> tags.
// We don't need a full HTML parser; we only want title + image, and meta tags
// are well-behaved. Case-insensitive, tolerates single/double quotes.
function extractMeta(html: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
    'i',
  )
  const m1 = html.match(pattern)
  if (m1) return m1[1]
  // Some sites write content="..." first, then property="...".
  const reversed = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${key}["']`,
    'i',
  )
  const m2 = html.match(reversed)
  return m2 ? m2[1] : null
}

function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : null
}

async function resolveOpenGraph(u: URL): Promise<Resolved | null> {
  try {
    const res = await fetchWithTimeout(u.toString(), {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html')) return null
    const html = await res.text()
    const title =
      extractMeta(html, 'og:title') ??
      extractMeta(html, 'twitter:title') ??
      extractTitleTag(html) ??
      ''
    const artwork =
      extractMeta(html, 'og:image') ??
      extractMeta(html, 'twitter:image') ??
      ''
    const artist =
      extractMeta(html, 'og:music:musician') ??
      extractMeta(html, 'music:musician') ??
      ''
    return { title, artist, artwork, sourceUrl: u.toString() }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = (searchParams.get('url') ?? '').trim()
  if (!raw) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  const parsed = isHttpUrl(raw)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const host = parsed.hostname.toLowerCase()
  let resolved: Resolved | null = null

  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
    resolved = await resolveSpotify(parsed)
  } else if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be'
  ) {
    resolved = await resolveYouTube(parsed)
  } else {
    resolved = await resolveOpenGraph(parsed)
  }

  // Always return 200 with whatever we got — empty fields are fine, the admin
  // fills them in by hand. Only the URL itself is guaranteed.
  return NextResponse.json(resolved ?? emptyResolved(parsed.toString()))
}
