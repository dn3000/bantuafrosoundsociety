import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { extractSpotifyArtistId, fetchSpotifyArtist } from '@/lib/spotify'
import { claudeMessage, extractJsonFromText } from '@/lib/anthropic'

const ALLOWED_SUBGENRES = [
  'afro house', 'amapiano', '3-step', 'deep house', 'soulful house',
  'afro tech', 'tribal', 'broken beat', 'gqom', 'shangaan electro',
  'bacardi', 'sgubhu',
]

type EnrichmentResult = {
  name: string
  bio: string | null
  imageUrl: string | null
  spotifyArtistId: string
  spotifyUrl: string | null
  spotifyFollowers: number
  spotifyPopularity: number
  spotifyGenres: string[]
  suggestedSubgenres: string[]
  suggestedCity: string | null
  suggestedCountry: string
  notes: string | null
}

export async function POST(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const url = (body.url || '').trim()
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  const spotifyId = extractSpotifyArtistId(url)
  if (!spotifyId) {
    return NextResponse.json(
      { error: 'Could not recognize Spotify artist URL. Expected: https://open.spotify.com/artist/...' },
      { status: 400 }
    )
  }

  // Fetch Spotify metadata
  let spotifyArtist
  try {
    spotifyArtist = await fetchSpotifyArtist(spotifyId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Spotify error'
    return NextResponse.json({ error: `Spotify lookup failed: ${msg}` }, { status: 502 })
  }

  // Ask Claude to suggest subgenres + city
  const system = `You are a music-scene-savvy curator helping classify South African house music artists for BASS, a curation platform. You will receive an artist's name and Spotify genre tags, and you'll suggest BASS-internal subgenre tags and infer their likely South African city if recognisable.

Respond with valid JSON only, in this exact shape:
{
  "subgenres": string[],
  "city": string | null,
  "bio": string | null,
  "notes": string | null
}

Rules:
- "subgenres" must be a subset of: ${ALLOWED_SUBGENRES.map((s) => `"${s}"`).join(', ')}. Pick the best 1-4 matches. If you can't confidently map any, return [].
- "city" should be a South African city if the artist is clearly SA-based and you're confident; otherwise null. Common SA cities: Johannesburg, Pretoria, Durban, Cape Town, Polokwane, Bloemfontein, Port Elizabeth, East London.
- "bio" should be a short (2-3 sentence) editorial blurb in BASS's voice — warm, knowledgeable, restrained. Only write a bio if you have enough public knowledge of this artist to be accurate. Otherwise null. NEVER invent facts.
- "notes" is an optional one-liner for admin (e.g., "Spotify popularity is high — strong featured candidate" or "Possibly not SA-based, verify"). null if nothing useful.`

  const userPrompt = `Artist name: ${spotifyArtist.name}
Spotify genres: ${spotifyArtist.genres.length > 0 ? spotifyArtist.genres.join(', ') : '(none listed)'}
Spotify followers: ${spotifyArtist.followers.toLocaleString()}
Spotify popularity score: ${spotifyArtist.popularity}/100`

  let suggestions: { subgenres?: string[]; city?: string | null; bio?: string | null; notes?: string | null } = {}
  try {
    const text = await claudeMessage(
      [{ role: 'user', content: userPrompt }],
      { system, maxTokens: 800 }
    )
    const parsed = extractJsonFromText(text) as typeof suggestions
    suggestions = parsed
  } catch (err) {
    // AI failures shouldn't block enrichment — return Spotify data without AI suggestions
    console.error('Claude enrichment failed:', err)
    suggestions = {}
  }

  const cleanedSubgenres = Array.isArray(suggestions.subgenres)
    ? suggestions.subgenres
        .filter((s) => typeof s === 'string')
        .filter((s) => ALLOWED_SUBGENRES.includes(s))
    : []

  const result: EnrichmentResult = {
    name: spotifyArtist.name,
    bio: typeof suggestions.bio === 'string' ? suggestions.bio.trim() : null,
    imageUrl: spotifyArtist.imageUrl,
    spotifyArtistId: spotifyArtist.id,
    spotifyUrl: spotifyArtist.externalUrl,
    spotifyFollowers: spotifyArtist.followers,
    spotifyPopularity: spotifyArtist.popularity,
    spotifyGenres: spotifyArtist.genres,
    suggestedSubgenres: cleanedSubgenres,
    suggestedCity: typeof suggestions.city === 'string' ? suggestions.city.trim() : null,
    suggestedCountry: 'South Africa',
    notes: typeof suggestions.notes === 'string' ? suggestions.notes.trim() : null,
  }

  return NextResponse.json({ enrichment: result })
}
