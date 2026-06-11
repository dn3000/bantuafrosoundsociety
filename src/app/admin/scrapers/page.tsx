'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Drives POST /api/admin/scrapers/spotify-new-releases from the browser. The
// engine is chunked + cursor-based; this page walks the whole scope by feeding
// nextCursor back in until it's null, so a full run never touches the console.
// Scraped drops auto-publish (status='approved') — the engine enforces that,
// not this page. The scraper only scans tracked (whitelisted) artists.

type ScrapeNote = { artist?: string; id?: string; error: string }
// Per-artist summary from the server's chunkArtists[] — drives the activity feed.
type ChunkArtist = {
  id: string
  name: string
  published: number
  duplicates: number
  oldSkipped: number
}
// How many recent per-artist rows to show in the activity feed (capped low
// so the panel stays compact — the run log lives in errors/warnings).
const RECENT_ARTISTS_LIMIT = 5
type ScanTotals = {
  artistsScanned: number
  releasesSeen: number
  queued: number
  skippedDuplicates: number
  skippedOld: number
}
type BackfillTotals = { scanned: number; filled: number; skipped: number }
// Playlist scan totals (the additive playlist scraper). Album-level dedup means
// `published` counts unique albums; `duplicates` counts repeat tracks of an
// already-seen album plus albums already in submissions.
type PlaylistTotals = {
  playlistsScanned: number
  processed: number
  published: number
  duplicates: number
  oldSkipped: number
  pagesFetched: number
}
type Phase = 'idle' | 'running' | 'done' | 'stopped' | 'rate_limited' | 'error'
type RunMode = 'scan' | 'backfill' | 'playlist'

const ENDPOINT = '/api/admin/scrapers/spotify-new-releases'
const PLAYLIST_ENDPOINT = '/api/admin/scrapers/spotify-playlists'
const ZERO_SCAN: ScanTotals = {
  artistsScanned: 0,
  releasesSeen: 0,
  queued: 0,
  skippedDuplicates: 0,
  skippedOld: 0,
}
const ZERO_BACKFILL: BackfillTotals = { scanned: 0, filled: 0, skipped: 0 }
const ZERO_PLAYLIST: PlaylistTotals = {
  playlistsScanned: 0,
  processed: 0,
  published: 0,
  duplicates: 0,
  oldSkipped: 0,
  pagesFetched: 0,
}

// 429 back-off thresholds (seconds). The engine returns the structured
// Retry-After; honour it directly — wait it out when short, but stop the run
// cleanly when Spotify asks for a long cooldown so we never sit spinning.
const RATE_LIMIT_MAX_WAIT_S = 120
// Fallback wait when a 429 arrives without a Retry-After header (Spotify almost
// always sends one). Short enough to keep moving, long enough to matter.
const DEFAULT_RATE_LIMIT_WAIT_S = 60

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error')

function clampInt(v: number, min: number, max: number, fallback: number) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

type RateOutcome =
  | { kind: 'wait'; seconds: number; consecutive: number }
  | { kind: 'stop'; retryAfterSeconds: number | null; reason: 'long' | 'repeated'; consecutive: number }

// Decide how to handle a 429 given the chunk response and the run's current
// consecutive-429 streak. Stop the whole run when either:
//   • Retry-After > RATE_LIMIT_MAX_WAIT_S — a long cooldown; don't sit waiting.
//   • 2 consecutive 429s with no successful call in between — the shared token is
//     throttled app-wide, so continuing only deepens the penalty.
// Otherwise wait the (bounded) Retry-After and continue.
function decideRateLimit(
  data: { retryAfter?: unknown; madeProgress?: unknown },
  consecutivePrev: number,
): RateOutcome {
  // A successful call since the last 429 resets the streak to this lone 429.
  const consecutive = data.madeProgress ? 1 : consecutivePrev + 1
  const retryAfter =
    typeof data.retryAfter === 'number' && Number.isFinite(data.retryAfter) ? data.retryAfter : null
  if (consecutive >= 2) {
    return { kind: 'stop', retryAfterSeconds: retryAfter, reason: 'repeated', consecutive }
  }
  if (retryAfter !== null && retryAfter > RATE_LIMIT_MAX_WAIT_S) {
    return { kind: 'stop', retryAfterSeconds: retryAfter, reason: 'long', consecutive }
  }
  const seconds = Math.min(retryAfter ?? DEFAULT_RATE_LIMIT_WAIT_S, RATE_LIMIT_MAX_WAIT_S)
  return { kind: 'wait', seconds: Math.max(1, seconds), consecutive }
}

// "after ~2m" / "after ~45s" / "later" for the rate-limit stop banner.
function formatResumeAfter(seconds: number | null): string {
  if (seconds == null) return 'later'
  if (seconds < 90) return `after ~${Math.max(1, Math.round(seconds))}s`
  return `after ~${Math.ceil(seconds / 60)}m`
}

// "~3m" / "~45s" — used for the ETA chip. Mirrors formatResumeAfter's bucketing.
function formatEta(seconds: number): string {
  const s = Math.max(1, Math.round(seconds))
  if (s < 90) return `~${s}s`
  return `~${Math.ceil(s / 60)}m`
}

export default function ScrapersPage() {
  // Controls
  const [tier, setTier] = useState('') // '' = all tracked
  const [sinceDate, setSinceDate] = useState('2026-01-01')
  const [chunkSize, setChunkSize] = useState(25)
  const [delayMs, setDelayMs] = useState(800)

  // Playlist-scan controls (separate from the per-artist scan above)
  const [pSinceDate, setPSinceDate] = useState('2026-01-01')
  const [pChunkSize, setPChunkSize] = useState(5)
  const [pDelayMs, setPDelayMs] = useState(800)

  // Run state
  const [phase, setPhase] = useState<Phase>('idle')
  const [runMode, setRunMode] = useState<RunMode | null>(null)
  const [scanTotals, setScanTotals] = useState<ScanTotals>(ZERO_SCAN)
  const [backfillTotals, setBackfillTotals] = useState<BackfillTotals>(ZERO_BACKFILL)
  const [playlistTotals, setPlaylistTotals] = useState<PlaylistTotals>(ZERO_PLAYLIST)
  const [errors, setErrors] = useState<ScrapeNote[]>([])
  const [warnings, setWarnings] = useState<ScrapeNote[]>([])
  const [totalWhitelist, setTotalWhitelist] = useState(0)
  const [totalPlaylists, setTotalPlaylists] = useState(0)
  const [position, setPosition] = useState(0)
  const [backfillPage, setBackfillPage] = useState(0)
  const [rateLimitWaiting, setRateLimitWaiting] = useState(false)
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0)
  const [fatalError, setFatalError] = useState<string | null>(null)
  // Set when a run stops because of rate limiting (distinct from a clean finish).
  const [rateLimitStop, setRateLimitStop] = useState<
    { retryAfterSeconds: number | null; reason: 'long' | 'repeated' } | null
  >(null)
  // Last N artists processed across all chunks, most-recent first. Drives the
  // "activity feed" below the per-chunk metrics so the operator can see which
  // artists actually got scanned during a long run.
  const [recentArtists, setRecentArtists] = useState<ChunkArtist[]>([])
  // Wall-clock when this run started — drives the ETA below the progress bar.
  // null while idle (no in-flight run); reset at the start of every runScan.
  const [runStartMs, setRunStartMs] = useState<number | null>(null)
  // Ticks every second during a run so the elapsed-driven ETA refreshes even
  // when no new chunk has arrived (between calls or during a cooldown).
  const [, setEtaTick] = useState(0)

  // YouTube Topic ingestion (one-shot, no cursor)
  const [ytPhase, setYtPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [ytResult, setYtResult] = useState<{
    artistsScanned: number
    imagesBackfilled: number
    inserted: number
    duplicates: number
    errors: { artist: string; error: string }[]
  } | null>(null)
  const [ytError, setYtError] = useState<string | null>(null)

  // YouTube OAC video ingestion (one-shot, no cursor)
  const [oacPhase, setOacPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [oacResult, setOacResult] = useState<{
    artistsScanned: number
    inserted: number
    duplicates: number
    skippedOfficialAudio: number
    byCategory: { mix: number; live_set: number; music_video: number; interview: number; other: number }
    errors: { artist: string; error: string }[]
  } | null>(null)
  const [oacError, setOacError] = useState<string | null>(null)

  // Bulk re-categorize pending videos (one-shot)
  const [rcPhase, setRcPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [rcResult, setRcResult] = useState<{
    scanned: number
    changed: number
    byCategory: { mix: number; live_set: number; music_video: number; interview: number; other: number }
  } | null>(null)
  const [rcError, setRcError] = useState<string | null>(null)

  // Wikidata OAC channel resolution (one-shot, free, no quota)
  const [wdPhase, setWdPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [wdResult, setWdResult] = useState<{
    checked: number
    resolved: number
    stillUnresolved: number
  } | null>(null)
  const [wdError, setWdError] = useState<string | null>(null)

  // YouTube Topic channel resolution (one-shot, quota-capped at 80 searches/run)
  const [trPhase, setTrPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [trResult, setTrResult] = useState<{
    checked: number
    resolved: number
    searchesUsed: number
    remainingUnresolved: number
  } | null>(null)
  const [trError, setTrError] = useState<string | null>(null)

  // stopRef short-circuits the async loop; abortRef cancels the in-flight chunk.
  const stopRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const running = phase === 'running'

  function resetForRun(mode: RunMode) {
    stopRef.current = false
    setRunMode(mode)
    setPhase('running')
    setFatalError(null)
    setErrors([])
    setWarnings([])
    setRateLimitWaiting(false)
    setRateLimitSeconds(0)
    setRateLimitStop(null)
    setScanTotals(ZERO_SCAN)
    setBackfillTotals(ZERO_BACKFILL)
    setPlaylistTotals(ZERO_PLAYLIST)
    setTotalWhitelist(0)
    setTotalPlaylists(0)
    setPosition(0)
    setBackfillPage(0)
    setRecentArtists([])
    setRunStartMs(Date.now())
  }

  // Tick the ETA chip every second while running so it stays fresh between
  // chunks. Cheap (one setState/sec); stops on phase change.
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setEtaTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  function stop() {
    stopRef.current = true
    abortRef.current?.abort()
  }

  // Visible, cancellable countdown so a rate-limit pause doesn't look like a hang.
  // Waits `seconds` (already bounded to RATE_LIMIT_MAX_WAIT_S by decideRateLimit).
  async function doCooldown(seconds: number) {
    setRateLimitWaiting(true)
    for (let s = Math.max(1, Math.ceil(seconds)); s > 0; s--) {
      if (stopRef.current) break
      setRateLimitSeconds(s)
      await sleep(1000)
    }
    setRateLimitWaiting(false)
    setRateLimitSeconds(0)
  }

  async function runScan() {
    resetForRun('scan')
    const totals = { ...ZERO_SCAN }
    const errs: ScrapeNote[] = []
    const warns: ScrapeNote[] = []
    let cursor = 0
    let whitelist = 0
    let consecutive429 = 0

    try {
      while (true) {
        if (stopRef.current) {
          setPhase('stopped')
          return
        }

        const body: Record<string, unknown> = {
          limitArtists: clampInt(chunkSize, 1, 50, 25),
          sinceDate,
          delayMs: clampInt(delayMs, 100, 5000, 800),
          cursor,
        }
        if (tier) body.tier = tier // omit entirely for "All tracked"

        const controller = new AbortController()
        abortRef.current = controller
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)

        // Accumulate running totals across chunks (each response is per-chunk).
        totals.artistsScanned += num(data.artistsScanned)
        totals.releasesSeen += num(data.releasesSeen)
        totals.queued += num(data.queued)
        totals.skippedDuplicates += num(data.skippedDuplicates)
        totals.skippedOld += num(data.skippedOld)
        if (Array.isArray(data.errors)) errs.push(...data.errors)
        if (Array.isArray(data.warnings)) warns.push(...data.warnings)
        if (typeof data.totalWhitelist === 'number') whitelist = data.totalWhitelist

        // Activity feed: take the chunk's per-artist summaries, most-recent
        // first within the chunk, prepend to the running list, keep the last
        // RECENT_ARTISTS_LIMIT across all chunks.
        if (Array.isArray(data.chunkArtists) && data.chunkArtists.length > 0) {
          const fromChunk = (data.chunkArtists as ChunkArtist[]).slice().reverse()
          setRecentArtists((prev) => [...fromChunk, ...prev].slice(0, RECENT_ARTISTS_LIMIT))
        }

        setScanTotals({ ...totals })
        setErrors([...errs])
        setWarnings([...warns])
        setTotalWhitelist(whitelist)

        const next = typeof data.nextCursor === 'number' ? data.nextCursor : null
        // Position is cursor-based, so it stays accurate even if a rate-limit
        // retry re-scans an artist and nudges artistsScanned up.
        setPosition(next ?? whitelist)

        if (data.rateLimited) {
          const outcome = decideRateLimit(data, consecutive429)
          consecutive429 = outcome.consecutive
          if (outcome.kind === 'stop') {
            // Long cooldown or repeated 429s: stop cleanly (distinct from "done").
            setRateLimitStop({ retryAfterSeconds: outcome.retryAfterSeconds, reason: outcome.reason })
            setPhase('rate_limited')
            return
          }
          await doCooldown(outcome.seconds)
          if (stopRef.current) {
            setPhase('stopped')
            return
          }
          cursor = next ?? cursor // resume at the artist that 429'd (dedup makes it safe)
          continue
        }
        // A clean chunk clears the consecutive-429 streak.
        consecutive429 = 0

        if (next === null) {
          setPhase('done')
          return
        }
        cursor = next
        await sleep(200) // small breather between chunks
      }
    } catch (err) {
      if (isAbort(err) || stopRef.current) setPhase('stopped')
      else {
        setFatalError(errMsg(err))
        setPhase('error')
      }
    } finally {
      setRateLimitWaiting(false)
      setRateLimitSeconds(0)
      abortRef.current = null
    }
  }

  async function runBackfill() {
    resetForRun('backfill')
    const totals = { ...ZERO_BACKFILL }
    const errs: ScrapeNote[] = []
    let page = 0
    let consecutive429 = 0

    try {
      while (true) {
        if (stopRef.current) {
          setPhase('stopped')
          return
        }

        const controller = new AbortController()
        abortRef.current = controller
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'backfill', limitArtists: clampInt(chunkSize, 1, 200, 50) }),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)

        totals.scanned += num(data.scanned)
        totals.filled += num(data.filled)
        totals.skipped += num(data.skipped)
        if (Array.isArray(data.errors)) errs.push(...data.errors)
        page += 1

        setBackfillTotals({ ...totals })
        setErrors([...errs])
        setBackfillPage(page)

        if (data.rateLimited) {
          const outcome = decideRateLimit(data, consecutive429)
          consecutive429 = outcome.consecutive
          if (outcome.kind === 'stop') {
            setRateLimitStop({ retryAfterSeconds: outcome.retryAfterSeconds, reason: outcome.reason })
            setPhase('rate_limited')
            return
          }
          await doCooldown(outcome.seconds)
          if (stopRef.current) {
            setPhase('stopped')
            return
          }
          continue
        }
        consecutive429 = 0

        // Backfill returns nextCursor:0 while a full page came back, null when done.
        if (data.nextCursor === null || data.nextCursor === undefined) {
          setPhase('done')
          return
        }
        await sleep(200)
      }
    } catch (err) {
      if (isAbort(err) || stopRef.current) setPhase('stopped')
      else {
        setFatalError(errMsg(err))
        setPhase('error')
      }
    } finally {
      setRateLimitWaiting(false)
      setRateLimitSeconds(0)
      abortRef.current = null
    }
  }

  // Playlist scan — mirrors runScan but drives the additive playlist endpoint.
  // Same cursor loop + decideRateLimit back-off; the response is the same shape.
  async function runPlaylistScan() {
    resetForRun('playlist')
    const totals = { ...ZERO_PLAYLIST }
    const errs: ScrapeNote[] = []
    let cursor = 0
    let total = 0
    let consecutive429 = 0

    try {
      while (true) {
        if (stopRef.current) {
          setPhase('stopped')
          return
        }

        const controller = new AbortController()
        abortRef.current = controller
        const res = await fetch(PLAYLIST_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sinceDate: pSinceDate,
            delayMs: clampInt(pDelayMs, 100, 5000, 800),
            chunkSize: clampInt(pChunkSize, 1, 25, 5),
            cursor,
          }),
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)

        totals.playlistsScanned += num(data.playlistsScanned)
        totals.processed += num(data.processed)
        totals.published += num(data.published)
        totals.duplicates += num(data.duplicates)
        totals.oldSkipped += num(data.oldSkipped)
        totals.pagesFetched += num(data.pagesFetched)
        // Playlist errors carry { playlist, error }; surface the name in the list.
        if (Array.isArray(data.errors)) {
          errs.push(
            ...data.errors.map((e: { playlist?: string; error?: string }) => ({
              artist: e.playlist,
              error: e.error ?? 'Unknown error',
            })),
          )
        }
        if (typeof data.totalPlaylists === 'number') total = data.totalPlaylists

        setPlaylistTotals({ ...totals })
        setErrors([...errs])
        setTotalPlaylists(total)

        const next = typeof data.nextCursor === 'number' ? data.nextCursor : null
        setPosition(next ?? total)

        if (data.rateLimited) {
          const outcome = decideRateLimit(data, consecutive429)
          consecutive429 = outcome.consecutive
          if (outcome.kind === 'stop') {
            setRateLimitStop({ retryAfterSeconds: outcome.retryAfterSeconds, reason: outcome.reason })
            setPhase('rate_limited')
            return
          }
          await doCooldown(outcome.seconds)
          if (stopRef.current) {
            setPhase('stopped')
            return
          }
          cursor = next ?? cursor // resume at the playlist that 429'd (dedup makes it safe)
          continue
        }
        consecutive429 = 0

        if (next === null) {
          setPhase('done')
          return
        }
        cursor = next
        await sleep(200) // small breather between chunks
      }
    } catch (err) {
      if (isAbort(err) || stopRef.current) setPhase('stopped')
      else {
        setFatalError(errMsg(err))
        setPhase('error')
      }
    } finally {
      setRateLimitWaiting(false)
      setRateLimitSeconds(0)
      abortRef.current = null
    }
  }

  async function runYouTubeOAC() {
    setOacPhase('running')
    setOacResult(null)
    setOacError(null)
    try {
      const res = await fetch('/api/admin/scrapers/youtube-oac', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setOacResult({
        artistsScanned: typeof data.artistsScanned === 'number' ? data.artistsScanned : 0,
        inserted: typeof data.inserted === 'number' ? data.inserted : 0,
        duplicates: typeof data.duplicates === 'number' ? data.duplicates : 0,
        skippedOfficialAudio: typeof data.skippedOfficialAudio === 'number' ? data.skippedOfficialAudio : 0,
        byCategory: data.byCategory ?? { mix: 0, live_set: 0, music_video: 0, interview: 0, other: 0 },
        errors: Array.isArray(data.errors) ? data.errors : [],
      })
      setOacPhase('done')
    } catch (err) {
      setOacError(errMsg(err))
      setOacPhase('error')
    }
  }

  async function runRecategorize() {
    setRcPhase('running')
    setRcResult(null)
    setRcError(null)
    try {
      const res = await fetch('/api/admin/scrapers/youtube-recategorize', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setRcResult({
        scanned: typeof data.scanned === 'number' ? data.scanned : 0,
        changed: typeof data.changed === 'number' ? data.changed : 0,
        byCategory: data.byCategory ?? { mix: 0, live_set: 0, music_video: 0, interview: 0, other: 0 },
      })
      setRcPhase('done')
    } catch (err) {
      setRcError(errMsg(err))
      setRcPhase('error')
    }
  }

  async function runYouTubeTopic() {
    setYtPhase('running')
    setYtResult(null)
    setYtError(null)
    try {
      const res = await fetch('/api/admin/scrapers/youtube-topic', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setYtResult({
        artistsScanned: typeof data.artistsScanned === 'number' ? data.artistsScanned : 0,
        imagesBackfilled: typeof data.imagesBackfilled === 'number' ? data.imagesBackfilled : 0,
        inserted: typeof data.inserted === 'number' ? data.inserted : 0,
        duplicates: typeof data.duplicates === 'number' ? data.duplicates : 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
      })
      setYtPhase('done')
    } catch (err) {
      setYtError(errMsg(err))
      setYtPhase('error')
    }
  }

  async function runWikidataResolve() {
    setWdPhase('running')
    setWdResult(null)
    setWdError(null)
    try {
      const res = await fetch('/api/admin/scrapers/wikidata-resolve', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setWdResult({
        checked: typeof data.checked === 'number' ? data.checked : 0,
        resolved: typeof data.resolved === 'number' ? data.resolved : 0,
        stillUnresolved: typeof data.stillUnresolved === 'number' ? data.stillUnresolved : 0,
      })
      setWdPhase('done')
    } catch (err) {
      setWdError(errMsg(err))
      setWdPhase('error')
    }
  }

  async function runTopicResolve() {
    setTrPhase('running')
    setTrResult(null)
    setTrError(null)
    try {
      const res = await fetch('/api/admin/scrapers/youtube-topic-resolve', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setTrResult({
        checked: typeof data.checked === 'number' ? data.checked : 0,
        resolved: typeof data.resolved === 'number' ? data.resolved : 0,
        searchesUsed: typeof data.searchesUsed === 'number' ? data.searchesUsed : 0,
        remainingUnresolved: typeof data.remainingUnresolved === 'number' ? data.remainingUnresolved : 0,
      })
      setTrPhase('done')
    } catch (err) {
      setTrError(errMsg(err))
      setTrPhase('error')
    }
  }

  // Progress denominator + percentage: artist scan counts artists, playlist scan
  // counts playlists; backfill has no fixed total.
  const denom = runMode === 'playlist' ? totalPlaylists : totalWhitelist
  const pct = denom > 0 ? Math.min(100, Math.round((position / denom) * 100)) : 0
  const showProgressCounter = (runMode === 'scan' || runMode === 'playlist') && denom > 0
  // ETA for the artist scan: extrapolate from elapsed-per-artist. Only shown
  // once artistsScanned > 2 so a single fast/slow chunk doesn't wild-swing the
  // estimate. Suppressed when the run isn't actively running.
  const etaSeconds: number | null = (() => {
    if (runMode !== 'scan' || phase !== 'running') return null
    if (runStartMs == null) return null
    if (scanTotals.artistsScanned <= 2) return null
    if (totalWhitelist <= scanTotals.artistsScanned) return null
    const elapsedMs = Math.max(0, Date.now() - runStartMs)
    const perArtistMs = elapsedMs / scanTotals.artistsScanned
    const remaining = totalWhitelist - scanTotals.artistsScanned
    return Math.round((remaining * perArtistMs) / 1000)
  })()
  const statusLabel =
    phase === 'running'
      ? runMode === 'scan'
        ? 'Scanning…'
        : runMode === 'playlist'
          ? 'Scanning playlists…'
          : 'Backfilling…'
      : phase === 'done'
        ? 'Complete'
        : phase === 'stopped'
          ? 'Stopped'
          : phase === 'rate_limited'
            ? 'Rate-limited'
            : phase === 'error'
              ? 'Failed'
              : ''

  const fieldClass =
    'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] transition-colors disabled:opacity-50 [color-scheme:dark]'
  const labelClass = 'block text-sm font-semibold text-[var(--color-fg-primary)] mb-1'

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Spotify scraper
          </h1>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to admin
          </Link>
        </div>

        {/* What this does */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">What this does</h2>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-3">
            Scans tracked (whitelisted) artists for Spotify releases since the chosen date. New drops
            are <strong>published live automatically</strong> (saved as approved submissions) — no
            per-release review, since every tracked artist is on the curated whitelist. It walks the
            whole scope automatically, one chunk at a time.
          </p>
          <ul className="text-xs text-[var(--color-fg-tertiary)] space-y-1 list-disc list-inside">
            <li>Runs in this browser tab — keep it open until the run finishes.</li>
            <li>Safe to stop and restart: already-queued releases are skipped on the next run.</li>
            <li>If Spotify rate-limits, the run pauses and resumes on its own.</li>
          </ul>
        </div>

        {/* Controls */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-4">Scope &amp; pacing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label htmlFor="tier" className={labelClass}>
                Scope (tier)
              </label>
              <select
                id="tier"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                disabled={running}
                className={fieldClass}
              >
                <option value="">All tracked</option>
                <option value="featured">Featured</option>
                <option value="active">Active</option>
                <option value="watch">Watch</option>
              </select>
            </div>
            <div>
              <label htmlFor="sinceDate" className={labelClass}>
                Since date
              </label>
              <input
                id="sinceDate"
                type="date"
                value={sinceDate}
                onChange={(e) => setSinceDate(e.target.value)}
                disabled={running}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="chunkSize" className={labelClass}>
                Chunk size (artists / call)
              </label>
              <input
                id="chunkSize"
                type="number"
                min={1}
                max={50}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                disabled={running}
                className={fieldClass}
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">1–50. Applies to both runs.</p>
            </div>
            <div>
              <label htmlFor="delayMs" className={labelClass}>
                Delay between artists (ms)
              </label>
              <input
                id="delayMs"
                type="number"
                min={100}
                max={5000}
                step={100}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                disabled={running}
                className={fieldClass}
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">
                100–5000. Raise it if Spotify pushes back.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={stop}
                className="border border-[var(--color-border-strong)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-bg-higher)] transition-colors"
              >
                Stop
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={runScan}
                  className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Run scan
                </button>
                <button
                  type="button"
                  onClick={runBackfill}
                  className="border border-[var(--color-border-default)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:border-[var(--color-border-strong)] transition-colors"
                >
                  Backfill dates
                </button>
              </>
            )}
          </div>
        </div>

        {/* Spotify playlists scan — additive sibling scraper, separate content source */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">Spotify playlists scan</h2>
            <Link
              href="/admin/playlists"
              className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Manage playlists →
            </Link>
          </div>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Scans every <strong>active tracked playlist</strong> for releases since the chosen date,
            taking each track&apos;s album as the unit. New drops publish live automatically — the
            curated playlist is the trust gate. One playlist replaces ~50 per-artist scans.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="pSinceDate" className={labelClass}>
                Since date
              </label>
              <input
                id="pSinceDate"
                type="date"
                value={pSinceDate}
                onChange={(e) => setPSinceDate(e.target.value)}
                disabled={running}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="pChunkSize" className={labelClass}>
                Chunk size (playlists / call)
              </label>
              <input
                id="pChunkSize"
                type="number"
                min={1}
                max={25}
                value={pChunkSize}
                onChange={(e) => setPChunkSize(Number(e.target.value))}
                disabled={running}
                className={fieldClass}
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">1–25.</p>
            </div>
            <div>
              <label htmlFor="pDelayMs" className={labelClass}>
                Delay between pages (ms)
              </label>
              <input
                id="pDelayMs"
                type="number"
                min={100}
                max={5000}
                step={100}
                value={pDelayMs}
                onChange={(e) => setPDelayMs(Number(e.target.value))}
                disabled={running}
                className={fieldClass}
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-1">100–5000.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <button
                type="button"
                onClick={stop}
                className="border border-[var(--color-border-strong)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-bg-higher)] transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={runPlaylistScan}
                className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                Run playlists scan
              </button>
            )}
          </div>
        </div>

        {/* Resolve OAC channels via Wikidata */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">Resolve OAC channels via Wikidata</h2>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Looks up each artist&apos;s Official Artist Channel using their Spotify ID against the
            Wikidata knowledge graph (P1902 → P2397).{' '}
            <strong>Free and unlimited — no API quota consumed.</strong> Only artists that have a
            Spotify ID but no OAC channel set are checked. Re-running is safe and idempotent.
          </p>
          <button
            type="button"
            onClick={runWikidataResolve}
            disabled={running || wdPhase === 'running'}
            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {wdPhase === 'running' ? 'Resolving…' : 'Resolve OAC channels via Wikidata (free)'}
          </button>

          {wdPhase === 'done' && wdResult && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <Metric label="Checked" value={wdResult.checked} />
                <Metric label="Resolved" value={wdResult.resolved} accent />
                <Metric label="Still unresolved" value={wdResult.stillUnresolved} />
              </div>
            </div>
          )}

          {wdError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">{wdError}</p>
          )}
        </div>

        {/* Resolve Topic channels via YouTube search */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">Resolve Topic channels via YouTube search</h2>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Searches YouTube for each artist&apos;s auto-generated &quot; - Topic&quot; channel and
            saves its ID.{' '}
            <strong>Quota-capped at 80 searches per run</strong> (100 units each, ~10k daily limit).
            Re-run daily until all artists are resolved — tracked artists are prioritised first.
          </p>
          <button
            type="button"
            onClick={runTopicResolve}
            disabled={running || trPhase === 'running'}
            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {trPhase === 'running' ? 'Resolving…' : 'Resolve Topic channels via YouTube search (≤80/run)'}
          </button>

          {trPhase === 'done' && trResult && (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Metric label="Checked" value={trResult.checked} />
                <Metric label="Resolved" value={trResult.resolved} accent />
                <Metric label="Searches used" value={trResult.searchesUsed} />
                <Metric label="Still unresolved" value={trResult.remainingUnresolved} />
              </div>
            </div>
          )}

          {trError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">{trError}</p>
          )}
        </div>

        {/* YouTube Topic channel releases */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">YouTube Topic channel releases</h2>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Fetches recent uploads from each tracked artist&apos;s YouTube Topic channel and adds
            them to the <strong>review queue as pending submissions</strong> — no auto-publish.
            Also backfills missing artist profile images from YouTube channel thumbnails.
            Costs ~1 quota unit per artist; safe to re-run (dedup by video ID).
          </p>
          <button
            type="button"
            onClick={runYouTubeTopic}
            disabled={running || ytPhase === 'running'}
            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {ytPhase === 'running' ? 'Ingesting…' : 'Ingest YouTube releases (Topic)'}
          </button>

          {ytPhase === 'done' && ytResult && (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                <Metric label="Artists scanned" value={ytResult.artistsScanned} />
                <Metric label="Images backfilled" value={ytResult.imagesBackfilled} accent />
                <Metric label="Inserted" value={ytResult.inserted} accent />
                <Metric label="Duplicates" value={ytResult.duplicates} />
                <Metric label="Errors" value={ytResult.errors.length} error={ytResult.errors.length > 0} />
              </div>
              {ytResult.errors.length > 0 && (
                <NoteList
                  title={`Errors (${ytResult.errors.length})`}
                  notes={ytResult.errors}
                  tone="error"
                />
              )}
            </div>
          )}

          {ytError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">{ytError}</p>
          )}
        </div>

        {/* YouTube OAC video ingestion */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">YouTube videos (OAC)</h2>
            <Link
              href="/admin/videos"
              className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Review queue →
            </Link>
          </div>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Fetches recent uploads from each tracked artist&apos;s Official Artist Channel and adds
            them to the <strong>Watch review queue as pending videos</strong> — no auto-publish.
            Category is suggested from the title and is editable per-item during review.
            Safe to re-run (dedup by video ID).
          </p>
          <button
            type="button"
            onClick={runYouTubeOAC}
            disabled={running || oacPhase === 'running'}
            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {oacPhase === 'running' ? 'Ingesting…' : 'Ingest YouTube videos (OAC)'}
          </button>

          {oacPhase === 'done' && oacResult && (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs mb-3">
                <Metric label="Artists scanned" value={oacResult.artistsScanned} />
                <Metric label="Inserted" value={oacResult.inserted} accent />
                <Metric label="Duplicates" value={oacResult.duplicates} />
                <Metric label="Skipped audio" value={oacResult.skippedOfficialAudio} />
                <Metric label="Errors" value={oacResult.errors.length} error={oacResult.errors.length > 0} />
              </div>
              {oacResult.inserted > 0 && (
                <div className="text-xs font-mono text-[var(--color-fg-secondary)] bg-[var(--color-bg-base)] rounded-[var(--radius-sm)] px-3 py-2">
                  <span className="text-[var(--color-fg-tertiary)]">by category — </span>
                  mix: {oacResult.byCategory.mix} · live set: {oacResult.byCategory.live_set} · music video: {oacResult.byCategory.music_video} · interview: {oacResult.byCategory.interview} · other: {oacResult.byCategory.other}
                </div>
              )}
              {oacResult.errors.length > 0 && (
                <NoteList
                  title={`Errors (${oacResult.errors.length})`}
                  notes={oacResult.errors}
                  tone="error"
                />
              )}
            </div>
          )}

          {oacError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">{oacError}</p>
          )}
        </div>

        {/* Bulk re-categorize pending videos */}
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">Re-categorize pending videos</h2>
          <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
            Re-runs the title categorizer over every <strong>pending</strong> video and updates rows
            whose category changed. Only touches videos with status <code className="text-xs">pending</code> —
            approved and rejected rows are never modified.
          </p>
          <button
            type="button"
            onClick={runRecategorize}
            disabled={running || rcPhase === 'running'}
            className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            {rcPhase === 'running' ? 'Re-categorizing…' : 'Re-categorize pending videos'}
          </button>

          {rcPhase === 'done' && rcResult && (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-3">
                <Metric label="Scanned" value={rcResult.scanned} />
                <Metric label="Updated" value={rcResult.changed} accent />
                <Metric label="Unchanged" value={rcResult.scanned - rcResult.changed} />
              </div>
              <div className="text-xs font-mono text-[var(--color-fg-secondary)] bg-[var(--color-bg-base)] rounded-[var(--radius-sm)] px-3 py-2">
                <span className="text-[var(--color-fg-tertiary)]">new distribution — </span>
                mix: {rcResult.byCategory.mix} · live set: {rcResult.byCategory.live_set} · music video: {rcResult.byCategory.music_video} · interview: {rcResult.byCategory.interview} · other: {rcResult.byCategory.other}
              </div>
            </div>
          )}

          {rcError && (
            <p className="mt-3 text-sm text-[var(--color-error)]">{rcError}</p>
          )}
        </div>

        {/* Rate-limit pause: short Retry-After — wait it out, then resume automatically */}
        {rateLimitWaiting && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-4 mb-6 border border-[var(--color-warning)]">
            <p className="text-sm text-[var(--color-warning)]">
              ⏳ Waiting out Spotify rate limit (Retry-After)… resuming in {rateLimitSeconds}s
            </p>
          </div>
        )}

        {/* Rate-limit STOP: long cooldown or repeated 429s — distinct from a clean finish */}
        {phase === 'rate_limited' && rateLimitStop && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6 border border-[var(--color-warning)]">
            <h2 className="text-sm font-semibold text-[var(--color-warning)] mb-2">
              ⏸ Stopped — Spotify rate-limited, resume {formatResumeAfter(rateLimitStop.retryAfterSeconds)}
            </h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">
              {rateLimitStop.reason === 'repeated'
                ? 'Hit 2 consecutive rate limits with no successful call in between — the shared Spotify token is throttled app-wide, so the run stopped instead of deepening the penalty. '
                : `Spotify asked for a cooldown longer than ${RATE_LIMIT_MAX_WAIT_S}s, so the run stopped instead of sitting idle for that long. `}
              Re-run once the cooldown passes to resume — already-published releases are skipped via
              source-URL dedup, so resuming is safe.
            </p>
          </div>
        )}

        {/* Live progress / results */}
        {runMode && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
                {runMode === 'scan' ? 'Scan' : runMode === 'playlist' ? 'Playlists scan' : 'Backfill'} — {statusLabel}
              </h2>
              {showProgressCounter && (
                <span className="text-xs text-[var(--color-fg-tertiary)] font-mono">
                  {position} / {denom} ({pct}%)
                </span>
              )}
              {runMode === 'backfill' && backfillPage > 0 && (
                <span className="text-xs text-[var(--color-fg-tertiary)] font-mono">
                  page {backfillPage}
                </span>
              )}
            </div>

            {showProgressCounter && (
              <>
                <div className="w-full h-2 bg-[var(--color-bg-base)] rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {etaSeconds !== null && (
                  <p className="text-[11px] text-[var(--color-fg-tertiary)] font-mono mb-4">
                    ETA: {formatEta(etaSeconds)}
                  </p>
                )}
                {etaSeconds === null && <div className="mb-4" />}
              </>
            )}

            {runMode === 'scan' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <Metric label="Artists scanned" value={scanTotals.artistsScanned} />
                <Metric label="Releases seen" value={scanTotals.releasesSeen} />
                <Metric label="Published" value={scanTotals.queued} accent />
                <Metric label="Duplicates" value={scanTotals.skippedDuplicates} />
                <Metric label="Old skipped" value={scanTotals.skippedOld} />
                <Metric label="Errors" value={errors.length} error={errors.length > 0} />
              </div>
            ) : runMode === 'playlist' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <Metric label="Playlists scanned" value={playlistTotals.playlistsScanned} />
                <Metric label="Tracks processed" value={playlistTotals.processed} />
                <Metric label="Published" value={playlistTotals.published} accent />
                <Metric label="Duplicates" value={playlistTotals.duplicates} />
                <Metric label="Old skipped" value={playlistTotals.oldSkipped} />
                <Metric label="Errors" value={errors.length} error={errors.length > 0} />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Metric label="Scanned" value={backfillTotals.scanned} />
                <Metric label="Filled" value={backfillTotals.filled} accent />
                <Metric label="Skipped" value={backfillTotals.skipped} />
                <Metric label="Errors" value={errors.length} error={errors.length > 0} />
              </div>
            )}

            {runMode === 'scan' && recentArtists.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-[var(--color-fg-tertiary)] mb-1">
                  Recent activity
                </div>
                <ul className="bg-[var(--color-bg-base)] rounded-[var(--radius-sm)] p-2 text-xs text-[var(--color-fg-secondary)] font-mono space-y-1">
                  {recentArtists.map((a, i) => (
                    <li key={`${a.id}-${i}`} className="truncate">
                      <span className="text-[var(--color-fg-primary)]">{a.name}</span>
                      <span className="text-[var(--color-fg-tertiary)]"> · </span>
                      <span className={a.published > 0 ? 'text-[var(--color-accent)]' : ''}>
                        +{a.published} published
                      </span>
                      <span className="text-[var(--color-fg-tertiary)]"> · {a.duplicates} dupes</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <NoteList title={`Warnings (${warnings.length})`} notes={warnings} tone="warning" />
            )}
            {errors.length > 0 && (
              <NoteList title={`Errors (${errors.length})`} notes={errors} tone="error" />
            )}
          </div>
        )}

        {/* Final summary */}
        {phase === 'done' && (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6 border border-[var(--color-border-default)]">
            <h2 className="text-sm font-semibold text-[var(--color-success)] mb-2">
              ✓ {runMode === 'scan' ? 'Scan complete' : runMode === 'playlist' ? 'Playlists scan complete' : 'Backfill complete'}
            </h2>
            <p className="text-sm text-[var(--color-fg-secondary)] mb-4">
              {runMode === 'scan'
                ? `${scanTotals.queued} new ${
                    scanTotals.queued === 1 ? 'release' : 'releases'
                  } published from ${scanTotals.artistsScanned} ${
                    scanTotals.artistsScanned === 1 ? 'artist' : 'artists'
                  } scanned. They're approved and live on the site now.`
                : runMode === 'playlist'
                  ? `${playlistTotals.published} new ${
                      playlistTotals.published === 1 ? 'release' : 'releases'
                    } published from ${playlistTotals.playlistsScanned} ${
                      playlistTotals.playlistsScanned === 1 ? 'playlist' : 'playlists'
                    } scanned (${playlistTotals.duplicates} duplicate-album ${
                      playlistTotals.duplicates === 1 ? 'skip' : 'skips'
                    }, ${playlistTotals.oldSkipped} too old). They're approved and live on the site now.`
                  : `${backfillTotals.filled} ${
                      backfillTotals.filled === 1 ? 'submission' : 'submissions'
                    } filled across ${backfillTotals.scanned} scanned.`}
            </p>
            <Link
              href="/admin/submissions"
              className="inline-block bg-[var(--color-accent)] text-[var(--color-fg-primary)] text-sm font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Open the submissions queue →
            </Link>
          </div>
        )}

        {phase === 'stopped' && (
          <p className="text-sm text-[var(--color-fg-secondary)] mb-6">
            Stopped. Partial results are shown above — re-running is safe (already-queued items are
            skipped).
          </p>
        )}

        {fatalError && <p className="text-sm text-[var(--color-error)]">{fatalError}</p>}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
  error,
}: {
  label: string
  value: number
  accent?: boolean
  error?: boolean
}) {
  const valueColor = error
    ? 'text-[var(--color-error)]'
    : accent
      ? 'text-[var(--color-accent)]'
      : 'text-[var(--color-fg-primary)]'
  return (
    <div>
      <div className="text-[var(--color-fg-tertiary)]">{label}</div>
      <div className={`font-semibold font-mono text-base ${valueColor}`}>{value}</div>
    </div>
  )
}

function NoteList({
  title,
  notes,
  tone,
}: {
  title: string
  notes: ScrapeNote[]
  tone: 'warning' | 'error'
}) {
  const titleColor = tone === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'
  // Cap the rendered list so a big run doesn't blow up the DOM.
  const shown = notes.slice(-50)
  return (
    <div className="mt-4">
      <div className={`text-xs font-semibold mb-1 ${titleColor}`}>{title}</div>
      <div className="max-h-40 overflow-auto rounded-[var(--radius-sm)] bg-[var(--color-bg-base)] p-2 text-xs text-[var(--color-fg-secondary)] font-mono space-y-1">
        {notes.length > 50 && (
          <div className="text-[var(--color-fg-tertiary)]">
            …showing last 50 of {notes.length}
          </div>
        )}
        {shown.map((n, i) => (
          <div key={i}>
            {(n.artist || n.id || '—') + ': '}
            {n.error}
          </div>
        ))}
      </div>
    </div>
  )
}
