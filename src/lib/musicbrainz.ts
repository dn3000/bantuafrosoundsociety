const USER_AGENT = 'BantuAfroSoundSociety/0.1 ( bantuafrosoundsociety.vercel.app )'
const BASE_URL = 'https://musicbrainz.org/ws/2'

export type MusicBrainzArtist = {
  id: string
  name: string
  sortName: string | null
  type: string | null
  country: string | null
  area: string | null  // Often city or region
  beginArea: string | null  // City of origin
  disambiguation: string | null
  aliases: string[]
  socials: {
    website: string | null
    instagram: string | null
    twitter: string | null
    facebook: string | null
    bandcamp: string | null
    soundcloud: string | null
    youtube: string | null
    discogsUrl: string | null
    wikipedia: string | null
  }
}

type RawUrlRelation = {
  type: string
  url: { resource: string }
}

type RawAlias = {
  name: string
  type?: string
  primary?: boolean
}

type RawArtist = {
  id: string
  name: string
  'sort-name'?: string
  type?: string
  country?: string
  area?: { name?: string }
  'begin-area'?: { name?: string }
  disambiguation?: string
  aliases?: RawAlias[]
  relations?: RawUrlRelation[]
}

function categorizeUrl(url: string): keyof MusicBrainzArtist['socials'] | null {
  const lower = url.toLowerCase()
  if (lower.includes('instagram.com')) return 'instagram'
  if (lower.includes('twitter.com') || lower.includes('x.com/')) return 'twitter'
  if (lower.includes('facebook.com')) return 'facebook'
  if (lower.includes('bandcamp.com')) return 'bandcamp'
  if (lower.includes('soundcloud.com')) return 'soundcloud'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  if (lower.includes('discogs.com')) return 'discogsUrl'
  if (lower.includes('wikipedia.org')) return 'wikipedia'
  return null
}

function parseArtist(raw: RawArtist): MusicBrainzArtist {
  const socials: MusicBrainzArtist['socials'] = {
    website: null,
    instagram: null,
    twitter: null,
    facebook: null,
    bandcamp: null,
    soundcloud: null,
    youtube: null,
    discogsUrl: null,
    wikipedia: null,
  }

  if (raw.relations) {
    for (const rel of raw.relations) {
      if (!rel.url?.resource) continue
      if (rel.type === 'official homepage' && !socials.website) {
        socials.website = rel.url.resource
      } else {
        const cat = categorizeUrl(rel.url.resource)
        if (cat && !socials[cat]) {
          socials[cat] = rel.url.resource
        }
      }
    }
  }

  const aliases: string[] = raw.aliases
    ? raw.aliases.map((a) => a.name).filter((n): n is string => typeof n === 'string')
    : []

  return {
    id: raw.id,
    name: raw.name,
    sortName: raw['sort-name'] || null,
    type: raw.type || null,
    country: raw.country || null,
    area: raw.area?.name || null,
    beginArea: raw['begin-area']?.name || null,
    disambiguation: raw.disambiguation || null,
    aliases,
    socials,
  }
}

// Strategy 1: Lookup by Spotify artist URL
export async function lookupBySpotifyUrl(
  spotifyArtistId: string
): Promise<MusicBrainzArtist | null> {
  const spotifyUrl = `https://open.spotify.com/artist/${spotifyArtistId}`
  const params = new URLSearchParams({
    query: `url:"${spotifyUrl}"`,
    fmt: 'json',
    inc: 'url-rels+aliases',
  })

  const url = `${BASE_URL}/url?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    const body = await res.text().catch(() => '')
    throw new Error(`MB URL lookup failed: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json() as {
    urls?: Array<{
      'relation-list'?: Array<{
        relations?: Array<{
          artist?: { id: string }
        }>
      }>
    }>
  }

  // Extract the first artist ID from the relation tree
  const firstArtistId: string | null = (() => {
    if (!data.urls || data.urls.length === 0) return null
    for (const u of data.urls) {
      const relLists = u['relation-list'] || []
      for (const rl of relLists) {
        const rels = rl.relations || []
        for (const r of rels) {
          if (r.artist?.id) return r.artist.id
        }
      }
    }
    return null
  })()

  if (!firstArtistId) return null

  // Fetch full artist by ID
  return fetchArtistById(firstArtistId)
}

export async function fetchArtistById(mbId: string): Promise<MusicBrainzArtist | null> {
  const params = new URLSearchParams({
    fmt: 'json',
    inc: 'url-rels+aliases',
  })
  const url = `${BASE_URL}/artist/${mbId}?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    const body = await res.text().catch(() => '')
    throw new Error(`MB artist fetch failed: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json() as RawArtist
  return parseArtist(data)
}

// Strategy 2: Search by name, prefer SA country
export async function searchByName(
  artistName: string
): Promise<MusicBrainzArtist | null> {
  // Escape quotes for Lucene query
  const escaped = artistName.replace(/"/g, '\\"')
  const query = `artist:"${escaped}" AND country:ZA`
  const params = new URLSearchParams({
    query,
    fmt: 'json',
    limit: '5',
  })
  const url = `${BASE_URL}/artist?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    const body = await res.text().catch(() => '')
    throw new Error(`MB name search failed: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json() as {
    artists?: Array<RawArtist & { score?: number }>
  }

  const candidates = data.artists || []
  // Only accept high-confidence top match (score >= 90)
  const top = candidates[0]
  if (!top || (top.score ?? 0) < 90) return null

  // Fetch full data by ID (the search response is abbreviated)
  return fetchArtistById(top.id)
}
