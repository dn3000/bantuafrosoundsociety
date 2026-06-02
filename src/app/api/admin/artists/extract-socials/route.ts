import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const URL_PATTERNS: Array<{
  column: keyof ExtractedSocials
  regex: RegExp
}> = [
  { column: 'bandcamp_url', regex: /Bandcamp:\s*(https?:\/\/[^\s|]+)/i },
  { column: 'soundcloud_url', regex: /SoundCloud:\s*(https?:\/\/[^\s|]+)/i },
  { column: 'discogs_url', regex: /Discogs:\s*(https?:\/\/[^\s|]+)/i },
  { column: 'wikipedia_url', regex: /Wikipedia:\s*(https?:\/\/[^\s|]+)/i },
  { column: 'youtube_url', regex: /YouTube:\s*(https?:\/\/[^\s|]+)/i },
]

type ExtractedSocials = {
  bandcamp_url: string | null
  soundcloud_url: string | null
  discogs_url: string | null
  wikipedia_url: string | null
  youtube_url: string | null
}

function extractFromNotes(notes: string | null): ExtractedSocials {
  const result: ExtractedSocials = {
    bandcamp_url: null,
    soundcloud_url: null,
    discogs_url: null,
    wikipedia_url: null,
    youtube_url: null,
  }
  if (!notes) return result

  for (const { column, regex } of URL_PATTERNS) {
    const match = notes.match(regex)
    if (match && match[1]) {
      // Strip trailing punctuation
      result[column] = match[1].replace(/[.,;:)\]'"]+$/, '')
    }
  }
  return result
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all artists with private_notes containing "Extra:" (MB enrichment marker)
  const { data: artists, error } = await supabase
    .from('artists')
    .select('id, name, private_notes, bandcamp_url, soundcloud_url, discogs_url, wikipedia_url, youtube_url')
    .like('private_notes', '%Extra:%')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let processedCount = 0
  let updatedCount = 0
  const updatesByColumn: Record<string, number> = {
    bandcamp_url: 0,
    soundcloud_url: 0,
    discogs_url: 0,
    wikipedia_url: 0,
    youtube_url: 0,
  }

  for (const artist of artists ?? []) {
    processedCount++
    const extracted = extractFromNotes(artist.private_notes as string | null)
    const updates: Partial<ExtractedSocials> = {}

    // Only set fields where current value is NULL
    for (const { column } of URL_PATTERNS) {
      const newValue = extracted[column]
      const currentValue = artist[column as keyof typeof artist] as string | null
      if (newValue && !currentValue) {
        updates[column] = newValue
        updatesByColumn[column]++
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('artists')
        .update(updates)
        .eq('id', artist.id)

      if (!updateError) {
        updatedCount++
      }
    }
  }

  return NextResponse.json({
    processed: processedCount,
    updated: updatedCount,
    byColumn: updatesByColumn,
  })
}
