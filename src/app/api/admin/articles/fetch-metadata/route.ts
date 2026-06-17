import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { parse } from 'node-html-parser'

const FETCH_TIMEOUT_MS = 8_000
const EXCERPT_MAX_WORDS = 40
const EXCERPT_MAX_CHARS = 280

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function truncateExcerpt(text: string): string {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/)
  if (words.length <= EXCERPT_MAX_WORDS && trimmed.length <= EXCERPT_MAX_CHARS) return trimmed
  const byWords = words.slice(0, EXCERPT_MAX_WORDS).join(' ')
  const candidate = byWords.length <= EXCERPT_MAX_CHARS ? byWords : byWords.slice(0, EXCERPT_MAX_CHARS)
  return candidate + '…'
}

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./, '')
}

function ogOrMeta(root: ReturnType<typeof parse>, property: string, name: string): string {
  const og = root.querySelector(`meta[property="${property}"]`)?.getAttribute('content')
  if (og) return og
  return root.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? ''
}

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('not http(s)')
    }
  } catch {
    return NextResponse.json({ error: 'url must be a valid http(s) URL' }, { status: 400 })
  }

  const partial: Record<string, string> = {}

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let html: string
    try {
      const res = await fetch(rawUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      })
      clearTimeout(timer)
      if (!res.ok) {
        return NextResponse.json({ ok: false, partial, error: `Remote returned ${res.status}` })
      }
      html = await res.text()
    } catch (fetchErr) {
      clearTimeout(timer)
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      return NextResponse.json({ ok: false, partial, error: msg })
    }

    const root = parse(html)

    const rawTitle =
      root.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      root.querySelector('title')?.text ||
      ''
    const rawExcerpt = ogOrMeta(root, 'og:description', 'description')
    const image = root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
    const rawSourceName =
      root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      stripWww(parsedUrl.hostname)
    const sourceUrl =
      root.querySelector('meta[property="og:url"]')?.getAttribute('content') || rawUrl

    const title = rawTitle.trim()
    const excerpt = rawExcerpt ? truncateExcerpt(rawExcerpt) : ''
    const sourceName = rawSourceName.trim()

    return NextResponse.json({
      ok: true,
      title,
      excerpt,
      image,
      sourceName,
      sourceUrl,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, partial, error: msg })
  }
}
