import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { lookupBySpotifyUrl, searchByName, type MusicBrainzArtist } from '@/lib/musicbrainz'

const CHUNK_SIZE = 8  // ~9 seconds per chunk at 1.1s delay
const DELAY_MS = 1100  // MusicBrainz: 1 req/sec max

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ArtistRow = {
  id: string
  name: string
  slug: string
  spotify_artist_id: string | null
  country: string | null
  city: string | null
  bio: string | null
  website_url: string | null
  instagram_handle: string | null
  twitter_handle: string | null
  facebook_url: string | null
  musicbrainz_artist_id: string | null
}

function extractHandle(url: string | null, domain: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!u.hostname.includes(domain)) return null
    const path = u.pathname.replace(/^\//, '').replace(/\/$/, '')
    // First path segment, strip @ if present
    const segment = path.split('/')[0].replace(/^@/, '')
    return segment || null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const { supabase, user, error: authError } = await requireAdmin()
  if (authError) return authError

  // Find or create the active job
  let { data: job } = await supabase
    .from('backfill_jobs')
    .select('*')
    .eq('status', 'running')
    .eq('job_type', 'artist_musicbrainz')
    .maybeSingle()

  if (!job) {
    const { count: totalCandidates } = await supabase
      .from('artists')
      .select('id', { count: 'exact', head: true })
      .not('spotify_artist_id', 'is', null)
      .is('musicbrainz_artist_id', null)

    if (!totalCandidates || totalCandidates === 0) {
      return NextResponse.json({ message: 'No artists need MusicBrainz enrichment', done: true, total: 0 })
    }

    const { data: newJob, error: jobError } = await supabase
      .from('backfill_jobs')
      .insert({
        job_type: 'artist_musicbrainz',
        status: 'running',
        started_by: user.id,
        total_count: totalCandidates,
      })
      .select('*')
      .single()

    if (jobError || !newJob) {
      return NextResponse.json({ error: jobError?.message || 'Failed to create job' }, { status: 500 })
    }
    job = newJob
  }

  // Fetch next chunk
  const { data: candidates } = await supabase
    .from('artists')
    .select('id, name, slug, spotify_artist_id, country, city, bio, website_url, instagram_handle, twitter_handle, facebook_url, musicbrainz_artist_id')
    .not('spotify_artist_id', 'is', null)
    .is('musicbrainz_artist_id', null)
    .limit(CHUNK_SIZE)

  const targets = (candidates ?? []) as ArtistRow[]

  if (targets.length === 0) {
    await supabase
      .from('backfill_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return NextResponse.json({ jobId: job.id, done: true, message: 'MusicBrainz enrichment complete' })
  }

  // private_notes lives in artists_private now — load the chunk's existing notes
  // so we can append audit lines and write them back to the sister table.
  const notesById = new Map<string, string | null>()
  {
    const { data: privRows } = await supabase
      .from('artists_private')
      .select('artist_id, private_notes')
      .in('artist_id', targets.map((t) => t.id))
    for (const row of privRows ?? []) {
      notesById.set(row.artist_id as string, row.private_notes as string | null)
    }
  }

  let successCount = job.success_count
  let errorCount = job.error_count
  let foundCount = 0
  let notFoundCount = 0
  let lastError: string | null = job.last_error
  let lastArtistName: string | null = job.last_processed_artist_name
  const today = new Date().toISOString().slice(0, 10)

  for (const artist of targets) {
    let mb: MusicBrainzArtist | null = null
    const attemptedStrategies: string[] = []

    try {
      // Strategy 1: Spotify URL lookup
      if (artist.spotify_artist_id) {
        attemptedStrategies.push('spotify_url')
        mb = await lookupBySpotifyUrl(artist.spotify_artist_id)
        if (mb) {
          await sleep(DELAY_MS)  // Required between calls
        }
      }

      // Strategy 2: Name search (only if first failed)
      if (!mb) {
        await sleep(DELAY_MS)  // Wait between strategy 1 attempt and strategy 2
        attemptedStrategies.push('name_search')
        mb = await searchByName(artist.name)
      }

      if (mb) {
        foundCount++
        // Build updates (only fill NULLs)
        const updates: Partial<ArtistRow> = {
          musicbrainz_artist_id: mb.id,
        }
        const conflicts: string[] = []
        const sociaUpdates: string[] = []

        // Country: only if NULL
        const mbCountry = mb.country
        if (mbCountry && !artist.country) {
          updates.country = mbCountry === 'ZA' ? 'South Africa' : mbCountry
        } else if (mbCountry && artist.country) {
          const ourCountry = artist.country.toLowerCase()
          const mbCountryFull = mbCountry === 'ZA' ? 'south africa' : mbCountry.toLowerCase()
          if (!ourCountry.includes(mbCountryFull) && !mbCountryFull.includes(ourCountry)) {
            conflicts.push(`MB country=${mbCountry} vs ours=${artist.country}`)
          }
        }

        // City: only if NULL
        const mbCity = mb.beginArea || mb.area
        if (mbCity && !artist.city) {
          updates.city = mbCity
        }

        // Disambiguation as bio if no bio
        if (mb.disambiguation && !artist.bio) {
          updates.bio = mb.disambiguation
        }

        // Socials: only if NULL
        if (mb.socials.website && !artist.website_url) {
          updates.website_url = mb.socials.website
        }
        if (mb.socials.instagram && !artist.instagram_handle) {
          const h = extractHandle(mb.socials.instagram, 'instagram.com')
          if (h) updates.instagram_handle = h
        }
        if (mb.socials.twitter && !artist.twitter_handle) {
          const h = extractHandle(mb.socials.twitter, 'twitter.com') || extractHandle(mb.socials.twitter, 'x.com')
          if (h) updates.twitter_handle = h
        }
        if (mb.socials.facebook && !artist.facebook_url) {
          updates.facebook_url = mb.socials.facebook
        }

        // Other socials/IDs as audit notes (no columns yet)
        if (mb.socials.bandcamp) sociaUpdates.push(`Bandcamp: ${mb.socials.bandcamp}`)
        if (mb.socials.soundcloud) sociaUpdates.push(`SoundCloud: ${mb.socials.soundcloud}`)
        if (mb.socials.youtube) sociaUpdates.push(`YouTube: ${mb.socials.youtube}`)
        if (mb.socials.discogsUrl) sociaUpdates.push(`Discogs: ${mb.socials.discogsUrl}`)
        if (mb.socials.wikipedia) sociaUpdates.push(`Wikipedia: ${mb.socials.wikipedia}`)
        if (mb.aliases.length > 0) sociaUpdates.push(`Aliases: ${mb.aliases.join(', ')}`)

        // Build audit line (stored in artists_private.private_notes now)
        const auditParts = [`MB enrichment ${today}: matched (${attemptedStrategies.join('+')})`]
        if (conflicts.length) auditParts.push(`Conflicts: ${conflicts.join('; ')}`)
        if (sociaUpdates.length) auditParts.push(`Extra: ${sociaUpdates.join(' | ')}`)
        const auditLine = auditParts.join(' • ')

        const currentNotes = notesById.get(artist.id) ?? null
        const newNotes = currentNotes ? `${currentNotes}\n${auditLine}` : auditLine

        const { error: updateError } = await supabase
          .from('artists')
          .update(updates)
          .eq('id', artist.id)

        let noteError: { message: string } | null = null
        if (!updateError) {
          const res = await supabase
            .from('artists_private')
            .upsert({ artist_id: artist.id, private_notes: newNotes }, { onConflict: 'artist_id' })
          noteError = res.error
        }

        if (updateError || noteError) {
          errorCount++
          lastError = `${artist.name}: DB update - ${(updateError ?? noteError)!.message}`
        } else {
          successCount++
        }
      } else {
        // Not found in MusicBrainz — mark sentinel so we don't retry
        notFoundCount++
        const auditLine = `MB enrichment ${today}: not found (${attemptedStrategies.join('+')})`
        const currentNotes = notesById.get(artist.id) ?? null
        await supabase
          .from('artists')
          .update({ musicbrainz_artist_id: 'not_in_musicbrainz' })
          .eq('id', artist.id)
        await supabase
          .from('artists_private')
          .upsert(
            {
              artist_id: artist.id,
              private_notes: currentNotes ? `${currentNotes}\n${auditLine}` : auditLine,
            },
            { onConflict: 'artist_id' },
          )
      }
    } catch (err) {
      errorCount++
      const msg = err instanceof Error ? err.message : 'Unknown error'
      lastError = `${artist.name}: ${msg.slice(0, 200)}`
      console.error(`MB enrichment failed for ${artist.name}:`, msg)
      // Don't mark sentinel — could be transient (rate limit, network)
    }

    lastArtistName = artist.name
    await sleep(DELAY_MS)  // Always sleep between artists
  }

  // Derive processed_count from "what's left"
  const { count: stillRemaining } = await supabase
    .from('artists')
    .select('id', { count: 'exact', head: true })
    .not('spotify_artist_id', 'is', null)
    .is('musicbrainz_artist_id', null)

  const actualProcessed = job.total_count - (stillRemaining ?? 0)

  await supabase
    .from('backfill_jobs')
    .update({
      processed_count: actualProcessed,
      success_count: successCount,
      error_count: errorCount,
      last_processed_artist_name: lastArtistName,
      last_error: lastError,
    })
    .eq('id', job.id)

  return NextResponse.json({
    jobId: job.id,
    done: false,
    chunkSize: targets.length,
    foundInChunk: foundCount,
    notFoundInChunk: notFoundCount,
    totalProcessed: actualProcessed,
    total: job.total_count,
    remaining: stillRemaining ?? 0,
  })
}
