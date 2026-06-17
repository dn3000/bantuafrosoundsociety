import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHART_SOURCES, fetchShazamTop, type ChartKey } from '@/lib/shazam'

// POST /api/admin/charts/refresh { chart_key }
//
// Lifecycle: fetch the Shazam top tracks for the chart_key → REPLACE the
// existing draft set (delete status='draft' rows for the key, insert the
// new pull as drafts with captured_at=now() + source='shazam').
//
// LOUD FAILURE: if the Shazam fetch fails or returns nothing usable, we
// short-circuit and write nothing. The admin sees the message, and the
// existing draft/published rows for this chart_key are untouched.

function isChartKey(v: unknown): v is ChartKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHART_SOURCES, v)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { chart_key?: unknown }
  try {
    body = (await request.json()) as { chart_key?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isChartKey(body.chart_key)) {
    return NextResponse.json(
      { error: `Unknown chart_key (allowed: ${Object.keys(CHART_SOURCES).join(', ')})` },
      { status: 400 },
    )
  }

  const chartKey = body.chart_key
  const source = CHART_SOURCES[chartKey]

  const result = await fetchShazamTop({
    country: source.country,
    genreUrlName: source.genreUrlName,
    language: source.language,
    limit: 50,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 200 })
  }

  const capturedAt = new Date().toISOString()
  const insertRows = result.tracks.map((t) => ({
    chart_key: chartKey,
    source: 'shazam',
    position: t.position,
    title: t.title,
    artist_name: t.artistName,
    artwork_url: t.artworkUrl,
    apple_music_url: t.appleMusicUrl,
    isrc: t.isrc,
    external_id: t.externalId,
    artist_id: null,
    status: 'draft' as const,
    captured_at: capturedAt,
  }))

  // Replace draft set: delete existing drafts for this key first, then insert.
  // We do delete-then-insert (not a transaction) because the supabase-js
  // client has no transactional API; if the insert fails after the delete,
  // the admin can re-run refresh — the previous drafts are gone, but the
  // PUBLISHED rows (the public-visible chart) are untouched.
  const { error: delErr } = await supabase
    .from('charts')
    .delete()
    .eq('chart_key', chartKey)
    .eq('status', 'draft')
  if (delErr) {
    return NextResponse.json(
      { ok: false, message: `Failed to clear existing drafts: ${delErr.message}` },
      { status: 200 },
    )
  }

  const { error: insErr } = await supabase.from('charts').insert(insertRows)
  if (insErr) {
    return NextResponse.json(
      { ok: false, message: `Insert failed: ${insErr.message}` },
      { status: 200 },
    )
  }

  return NextResponse.json({
    ok: true,
    chart_key: chartKey,
    inserted: insertRows.length,
    captured_at: capturedAt,
    playlist_id: result.playlistId,
  })
}
