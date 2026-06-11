const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'BASS-BantuAfroSoundSociety/1.0 (nleya.dn@gmail.com)'
const BATCH_SIZE = 120
const DELAY_MS = 300

// Wikidata P1902 = Spotify artist ID, P2397 = YouTube channel ID.
// Batches up to BATCH_SIZE IDs per SPARQL query, sequential with DELAY_MS between batches.
// Returns a map of Spotify artist ID → YouTube channel ID for artists found in Wikidata.
// Never throws — a failed batch is silently skipped.
export async function resolveYouTubeChannelsBySpotifyIds(
  spotifyIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (spotifyIds.length === 0) return result

  for (let i = 0; i < spotifyIds.length; i += BATCH_SIZE) {
    const batch = spotifyIds.slice(i, i + BATCH_SIZE)
    const valuesClause = batch.map((id) => `"${id}"`).join(' ')
    const sparql = `SELECT ?spotify ?yt WHERE {
  VALUES ?spotify { ${valuesClause} }
  ?artist wdt:P1902 ?spotify .
  ?artist wdt:P2397 ?yt .
}`

    try {
      const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
      })
      if (!res.ok) continue

      const data = (await res.json()) as {
        results?: {
          bindings?: Array<{
            spotify?: { value?: string }
            yt?: { value?: string }
          }>
        }
      }

      for (const binding of data?.results?.bindings ?? []) {
        const spotifyId = binding.spotify?.value
        const ytId = binding.yt?.value
        // Take first match per Spotify ID in case an artist has multiple channels in Wikidata.
        if (spotifyId && ytId && !result.has(spotifyId)) {
          result.set(spotifyId, ytId)
        }
      }
    } catch {
      // defensive — skip failed batch, continue with the rest
    }

    if (i + BATCH_SIZE < spotifyIds.length) {
      await new Promise<void>((r) => setTimeout(r, DELAY_MS))
    }
  }

  return result
}
