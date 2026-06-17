import { NextResponse } from 'next/server'
import { parse, HTMLElement } from 'node-html-parser'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { utcIsoToSastLocal } from '@/lib/events'

const FETCH_TIMEOUT_MS = 8000
const RESPONSE_BYTE_CAP = 2 * 1024 * 1024 // 2 MB
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ' +
  '(+BASS-Admin-Resolver)'

// Public response shape — used by the admin "Paste a link" form. Every field
// is nullable so a partial extraction is still useful. event_date / end_date
// are SAST wall-clock strings ("YYYY-MM-DDTHH:mm") ready to drop into the
// datetime-local input that the rest of the form already speaks. They are
// ONLY populated when the source carried an explicit timezone — see the
// DATE SAFETY RULE in this file.
type Resolved = {
  title: string | null
  description: string | null
  poster_url: string | null
  venue: string | null
  city: string | null
  country: string | null
  event_date: string | null
  end_date: string | null
  ticket_url: string | null
  source_url: string
  lineup_text: string | null
  dateNeedsReview: boolean
  resolved: boolean
  message?: string
}

function emptyResolved(sourceUrl: string, message?: string): Resolved {
  return {
    title: null, description: null, poster_url: null,
    venue: null, city: null, country: null,
    event_date: null, end_date: null,
    ticket_url: null, source_url: sourceUrl,
    lineup_text: null,
    dateNeedsReview: true,
    resolved: false,
    message,
  }
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

// Stream the response with a hard byte cap so a deliberately huge page can't
// blow up memory. We don't need more than the first ~MB for OG/JSON-LD on
// any sane event page.
async function fetchHtmlBounded(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-ZA,en;q=0.9',
      },
    })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (ct && !ct.includes('html') && !ct.includes('xml')) return null
    const body = res.body
    if (!body) return null
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        if (total > RESPONSE_BYTE_CAP) {
          try { await reader.cancel() } catch { /* noop */ }
          break
        }
        chunks.push(value)
      }
    }
    const merged = new Uint8Array(total > RESPONSE_BYTE_CAP ? RESPONSE_BYTE_CAP : total)
    let offset = 0
    for (const c of chunks) {
      const space = merged.length - offset
      if (space <= 0) break
      const take = Math.min(space, c.length)
      merged.set(c.subarray(0, take), offset)
      offset += take
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

// ── Common extractors ───────────────────────────────────────────────────────

function metaContent(root: HTMLElement, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel)
    const v = el?.getAttribute('content')?.trim()
    if (v) return v
  }
  return null
}

function normalizeImageUrl(value: string | null, base: URL): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('//')) return `${base.protocol}${v}`
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  if (v.startsWith('/')) return `${base.protocol}//${base.host}${v}`
  return null
}

function normalizeTitle(raw: string | null): string | null {
  if (!raw) return null
  let t = raw.replace(/\s+/g, ' ').trim()
  // Strip trailing "| Site Name", " - Site Name", etc.
  t = t.replace(/\s*[|–—\-:]\s*(Howler|Quicket|Webtickets|TicketPro|Computicket|Ticketmaster|iTickets).*$/i, '')
  // Strip leading "Book tickets for ", "Buy tickets to ", "Tickets for "
  t = t.replace(/^(book tickets for|buy tickets (?:to|for)|tickets for|get tickets for)\s+/i, '')
  return t.trim() || null
}

function jsonLdEvents(root: HTMLElement): Array<Record<string, unknown>> {
  const scripts = root.querySelectorAll('script[type="application/ld+json"]')
  const out: Array<Record<string, unknown>> = []
  for (const s of scripts) {
    const raw = s.text?.trim()
    if (!raw) continue
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { continue }
    const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed]
    while (stack.length) {
      const node = stack.shift()
      if (!node || typeof node !== 'object') continue
      const obj = node as Record<string, unknown>
      const graph = obj['@graph']
      if (Array.isArray(graph)) stack.push(...graph)
      const type = obj['@type']
      const types = Array.isArray(type) ? type : type ? [type] : []
      if (types.some((t) => typeof t === 'string' && /event/i.test(t))) {
        out.push(obj)
      }
    }
  }
  return out
}

// Convert an ISO-with-offset (or trailing 'Z') string into a SAST wall-clock
// string the datetime-local input expects. Returns null when the input has
// no explicit timezone — the date-safety rule.
function offsetIsoToSastWall(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  // Must end with Z or have a ±HH:MM offset right at the end.
  const hasExplicitTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(s)
  if (!hasExplicitTz) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return utcIsoToSastLocal(d.toISOString())
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

// Pull a usable string out of JSON-LD's location.{name,address} or image.
function unwrapImage(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v) && v.length > 0) return unwrapImage(v[0])
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return strOrNull(o.url) ?? strOrNull(o.contentUrl)
  }
  return null
}

function unwrapLocation(v: unknown): { venue: string | null; city: string | null; country: string | null } {
  if (!v) return { venue: null, city: null, country: null }
  const node = Array.isArray(v) ? v[0] : v
  if (!node || typeof node !== 'object') return { venue: null, city: null, country: null }
  const o = node as Record<string, unknown>
  const venue = strOrNull(o.name)
  let city: string | null = null
  let country: string | null = null
  const addr = o.address
  if (typeof addr === 'string') {
    // Fall back: last comma segment as city.
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) city = parts[parts.length - 1]
  } else if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>
    city = strOrNull(a.addressLocality) ?? strOrNull(a.addressRegion)
    country = strOrNull(a.addressCountry)
  }
  return { venue, city, country }
}

function unwrapPerformerNames(v: unknown): string | null {
  if (!v) return null
  const items = Array.isArray(v) ? v : [v]
  const names: string[] = []
  for (const it of items) {
    if (typeof it === 'string') {
      if (it.trim()) names.push(it.trim())
    } else if (it && typeof it === 'object') {
      const n = strOrNull((it as Record<string, unknown>).name)
      if (n) names.push(n)
    }
  }
  return names.length ? names.join(', ') : null
}

function unwrapOffersUrl(v: unknown): string | null {
  if (!v) return null
  const items = Array.isArray(v) ? v : [v]
  for (const it of items) {
    if (it && typeof it === 'object') {
      const u = strOrNull((it as Record<string, unknown>).url)
      if (u) return u
    }
  }
  return null
}

// ── Generic OG / <title> layer ───────────────────────────────────────────────

function extractOg(root: HTMLElement, baseUrl: URL): Partial<Resolved> {
  const title =
    metaContent(root, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
    root.querySelector('title')?.text?.trim() ?? null
  const description =
    metaContent(root, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]'])
  const ogImage = metaContent(root, ['meta[property="og:image"]', 'meta[name="twitter:image"]'])
  return {
    title: normalizeTitle(title),
    description: description ?? null,
    poster_url: normalizeImageUrl(ogImage, baseUrl),
  }
}

// ── JSON-LD layer ────────────────────────────────────────────────────────────

function extractJsonLd(root: HTMLElement, baseUrl: URL): Partial<Resolved> {
  const events = jsonLdEvents(root)
  if (events.length === 0) return {}
  // Prefer the first node that has a startDate; otherwise the first event at all.
  const ev = events.find((e) => typeof e.startDate === 'string') ?? events[0]
  const loc = unwrapLocation(ev.location)
  return {
    title: normalizeTitle(strOrNull(ev.name)),
    description: strOrNull(ev.description),
    poster_url: normalizeImageUrl(unwrapImage(ev.image), baseUrl),
    venue: loc.venue,
    city: loc.city,
    country: loc.country,
    event_date: offsetIsoToSastWall(strOrNull(ev.startDate)),
    end_date: offsetIsoToSastWall(strOrNull(ev.endDate)),
    ticket_url: unwrapOffersUrl(ev.offers),
    lineup_text: unwrapPerformerNames(ev.performer),
  }
}

// ── Host adapters ────────────────────────────────────────────────────────────

// Howler tags every event with a date line carrying an explicit "SAST" or
// "+02:00" marker, so we can recover an offset-aware datetime even when
// JSON-LD is absent.
const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
}

function parseHowlerSastDate(text: string): string | null {
  // Look for "HH:MM D Mon YYYY ... (SAST | +02:00 | UTC+02:00 | +0200)".
  const re = /(\d{1,2}):(\d{2})\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})[\s\S]{0,160}?(SAST|\+02:?00|UTC\+02)/i
  const m = text.match(re)
  if (!m) return null
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  const day = m[3].padStart(2, '0')
  const monKey = m[4].toLowerCase()
  const mon = MONTH_MAP[monKey] ?? MONTH_MAP[monKey.slice(0, 3)]
  if (!mon) return null
  const year = m[5]
  return offsetIsoToSastWall(`${year}-${mon}-${day}T${hh}:${mm}:00+02:00`)
}

function extractHowler(root: HTMLElement, baseUrl: URL, og: Partial<Resolved>): Partial<Resolved> {
  const out: Partial<Resolved> = {}
  // Date with explicit SAST offset, scanned across the full visible text.
  const visible = root.text ?? ''
  const date = parseHowlerSastDate(visible)
  if (date) {
    out.event_date = date
    out.dateNeedsReview = false
  }
  // Venue: Howler tends to use a single h2 for the venue name; fall back to
  // the og:title's trailing " - {Venue}" if present.
  const venueHeading = root.querySelectorAll('h2, h3')
    .map((el) => el.text?.trim() ?? '')
    .find((t) => t && t.length < 80 && !/^tickets$/i.test(t) && !/about|lineup/i.test(t))
  if (venueHeading) out.venue = venueHeading
  // City: look for "...{venue}, {City}" in the visible text near the venue line.
  if (out.venue) {
    const m = new RegExp(`${out.venue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,\\s*([A-Z][A-Za-z\\s]+)`).exec(visible)
    if (m) out.city = m[1].trim().split(/\s{2,}|\n/)[0].trim()
  }
  // Lineup: collect performer-looking links. Howler renders lineup names as
  // headings within a "Line-up" section; grabbing every short h3/h4 in that
  // block is good enough for a prefill.
  const lineupSection = root.querySelectorAll('section, div')
    .find((el) => /lineup|line-up/i.test(el.text ?? '') && (el.text ?? '').length < 1500)
  if (lineupSection) {
    const names = new Set<string>()
    for (const h of lineupSection.querySelectorAll('h2, h3, h4, h5, a')) {
      const n = h.text?.trim() ?? ''
      if (n && n.length > 1 && n.length < 50 && !/lineup|line-up|tickets|venue|book/i.test(n)) {
        names.add(n)
      }
    }
    if (names.size > 0) out.lineup_text = Array.from(names).slice(0, 12).join(', ')
  }
  // Country defaults to South Africa for Howler.
  out.country = 'South Africa'
  // ticket_url: og:url or canonical when present, else the page URL.
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href')
  out.ticket_url = (canonical && normalizeImageUrl(canonical, baseUrl)) ?? og.ticket_url ?? baseUrl.toString()
  return out
}

// Quicket: og:image is usually a 300x300 thumb, but the full-res poster lives
// at images.quicket.co.za/{id}_0.jpeg. The on-page date has no timezone, so
// per the date-safety rule we never return event_date for Quicket.
function quicketFullResImage(thumb: string | null, root: HTMLElement, baseUrl: URL): string | null {
  // 1. Try the thumb URL itself — replace _<size>x<size>.<ext> with _0.<ext>.
  if (thumb) {
    const swapped = thumb.replace(/_(\d{2,4})x(\d{2,4})\.(jpe?g|png|webp)(\?.*)?$/i, '_0.$3')
    if (swapped !== thumb) return swapped
  }
  // 2. Search the HTML for images.quicket.co.za/{id}_0.<ext>.
  const html = root.outerHTML
  const m = html.match(/https?:\/\/images\.quicket\.co\.za\/[A-Za-z0-9_-]+_0\.(?:jpe?g|png|webp)/i)
  if (m) return m[0]
  // 3. Fall back to whichever <img> on the page is highest-resolution.
  const imgs = root.querySelectorAll('img')
  for (const img of imgs) {
    const src = img.getAttribute('src') ?? ''
    if (/quicket/i.test(src) && /_0\.(jpe?g|png|webp)/i.test(src)) {
      return normalizeImageUrl(src, baseUrl)
    }
  }
  return null
}

function extractQuicket(root: HTMLElement, baseUrl: URL, og: Partial<Resolved>): Partial<Resolved> {
  const out: Partial<Resolved> = {}
  // Poster: prefer full-res over the og:image thumb.
  const full = quicketFullResImage(og.poster_url ?? null, root, baseUrl)
  if (full) out.poster_url = full
  // Address line — Quicket renders the venue name on the line above a
  // multi-segment address ("123 Main St, Newtown, Johannesburg, 2113").
  const html = root.outerHTML
  const addrMatch = html.match(/([^<>\n]{4,120}?),\s*([A-Z][A-Za-z\s'.\-]{2,40}),\s*(\d{4,5})/)
  if (addrMatch) {
    const fullAddr = `${addrMatch[1]}, ${addrMatch[2]}, ${addrMatch[3]}`
    out.city = addrMatch[2].trim()
    // Look for a short heading immediately preceding the address — that's
    // usually the venue name.
    const before = html.slice(0, html.indexOf(addrMatch[0]))
    const venueMatch = before.match(/>([^<>\n]{3,80})<\/(?:h\d|p|span|div)>\s*(?:<[^>]+>\s*)*$/i)
    if (venueMatch) {
      const v = venueMatch[1].trim()
      if (v && !/address|location|venue/i.test(v)) out.venue = v
    }
    if (!out.venue) {
      // Last resort: the first comma segment of the address line itself.
      out.venue = fullAddr.split(',')[0].trim()
    }
  }
  out.country = 'South Africa'
  // ticket_url: keep the pasted URL (canonical may exist but Quicket already
  // serves the event detail at the URL the admin pasted).
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href')
  out.ticket_url = (canonical && normalizeImageUrl(canonical, baseUrl)) ?? og.ticket_url ?? baseUrl.toString()
  // Lineup: scan the "About" / description text for known DJ-name patterns.
  // We have no robust heuristic here, so just leave it to the og:description
  // (already populated) — the admin will refine the lineup_text by hand.
  // DATE SAFETY: Quicket's visible date has no year or timezone.
  out.dateNeedsReview = true
  out.event_date = null
  out.end_date = null
  return out
}

// ── Merge + dispatch ─────────────────────────────────────────────────────────

function merge(...layers: Array<Partial<Resolved>>): Partial<Resolved> {
  const out: Partial<Resolved> = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue
      if (v === null) {
        // Preserve nulls only if no prior layer set a value.
        if (!(k in out)) (out as Record<string, unknown>)[k] = null
        continue
      }
      ;(out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

function isHowler(host: string): boolean {
  return host === 'howler.co.za' || host.endsWith('.howler.co.za')
}
function isQuicket(host: string): boolean {
  return host === 'quicket.co.za' || host.endsWith('.quicket.co.za')
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const raw = typeof body.url === 'string' ? body.url.trim() : ''
  if (!raw) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  const parsed = isHttpUrl(raw)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid URL — must be http(s)' }, { status: 400 })
  }

  const html = await fetchHtmlBounded(parsed.toString())
  if (!html) {
    return NextResponse.json(
      emptyResolved(parsed.toString(), 'Could not fetch that page (timeout or non-HTML response)'),
    )
  }

  let root: HTMLElement
  try {
    root = parse(html, { lowerCaseTagName: true, comment: false })
  } catch {
    return NextResponse.json(
      emptyResolved(parsed.toString(), 'Could not parse page HTML'),
    )
  }

  const host = parsed.hostname.toLowerCase()
  const og = extractOg(root, parsed)
  const ld = extractJsonLd(root, parsed)
  // Host adapters layer on top of OG and JSON-LD with the most specific picks
  // (date with offset, full-res image, etc.).
  let host_: Partial<Resolved> = {}
  if (isHowler(host)) host_ = extractHowler(root, parsed, { ...og, ...ld })
  else if (isQuicket(host)) host_ = extractQuicket(root, parsed, { ...og, ...ld })

  const merged = merge(og, ld, host_)

  // DATE SAFETY RULE — final guard: if anywhere upstream slipped through a
  // value that did NOT come from an explicit-tz source, this is the catch-all.
  // event_date / end_date already use offsetIsoToSastWall(), which returns
  // null without an explicit tz, so this is mostly belt-and-braces.
  const eventDate = merged.event_date ?? null
  const endDate = merged.end_date ?? null
  const dateNeedsReview = eventDate === null ? true : (merged.dateNeedsReview ?? false)

  // ticket_url: prefer JSON-LD offers.url; else canonical from the adapter;
  // else the pasted URL itself. source_url is always the pasted URL.
  const ticketUrl = merged.ticket_url ?? parsed.toString()
  const sourceUrl = parsed.toString()

  // Resolved flag: we count "resolved" as having recovered SOMETHING beyond
  // just the source URL — at minimum a title or a poster image.
  const resolved =
    !!(merged.title ?? merged.poster_url ?? merged.description ?? merged.venue ?? eventDate)

  const out: Resolved = {
    title: merged.title ?? null,
    description: merged.description ?? null,
    poster_url: merged.poster_url ?? null,
    venue: merged.venue ?? null,
    city: merged.city ?? null,
    country: merged.country ?? null,
    event_date: eventDate,
    end_date: endDate,
    ticket_url: ticketUrl,
    source_url: sourceUrl,
    lineup_text: merged.lineup_text ?? null,
    dateNeedsReview,
    resolved,
    message: resolved ? undefined : 'No usable metadata on that page — fill the fields by hand.',
  }

  return NextResponse.json(out)
}
