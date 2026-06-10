import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  resolveChannelByHandle,
  getChannelById,
  getRecentUploads,
  searchChannel,
} from '@/lib/youtube'

type ArtistInput = { name: string; value: string }

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gate to admins via the is_admin() security-definer function — no direct
    // user_roles read.
    const { data: admin } = await supabase.rpc('is_admin')
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fail fast with a readable message rather than a cryptic empty-body 500.
    if (!process.env.YOUTUBE_API_KEY) {
      return NextResponse.json(
        { error: 'YOUTUBE_API_KEY not set in this environment' },
        { status: 500 },
      )
    }

    let body: { artists?: ArtistInput[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const artists = Array.isArray(body.artists) ? body.artists : []
    if (artists.length === 0) {
      return NextResponse.json({ error: 'No artists provided' }, { status: 400 })
    }

    let searchOpsUsed = 0

    const results = await Promise.all(
      artists.map(async ({ name, value }) => {
        // Per-artist isolation: one bad lookup must not crash the whole batch.
        try {
          // --- Official Artist Channel: channel ID (UC… 24 chars) or handle ---
          let oac: {
            channelId: string
            title: string
            uploadsPlaylistId: string
            recentUploads: Awaited<ReturnType<typeof getRecentUploads>>
          } | null = null

          const isChannelId = value.startsWith('UC') && value.length === 24
          const oacChannel = isChannelId
            ? await getChannelById(value)
            : await resolveChannelByHandle(value)
          if (oacChannel) {
            const uploads = await getRecentUploads(oacChannel.uploadsPlaylistId)
            oac = { ...oacChannel, recentUploads: uploads }
          }

          // --- Auto-generated Topic channel via search ---
          let topic: typeof oac | null = null

          searchOpsUsed += 1
          const searchResults = await searchChannel(`${name} topic`)
          const topicMatch = searchResults.find((r) => r.title.endsWith(' - Topic'))
          if (topicMatch) {
            const topicChannel = await getChannelById(topicMatch.channelId)
            if (topicChannel) {
              const uploads = await getRecentUploads(topicChannel.uploadsPlaylistId)
              topic = { ...topicChannel, recentUploads: uploads }
            }
          }

          return { name, oac, topic }
        } catch (artistErr) {
          const message = artistErr instanceof Error ? artistErr.message : String(artistErr)
          return { name, error: message }
        }
      }),
    )

    return NextResponse.json({
      results,
      note: `search ops used: ${searchOpsUsed}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
