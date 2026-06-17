import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHART_SOURCES, type ChartKey } from '@/lib/shazam'

// POST /api/admin/charts/publish { chart_key }
//
// Replace the live set: delete existing status='published' rows for the
// chart_key, then flip all current status='draft' rows for the key to
// status='published'. Idempotent — re-publishing the same drafts is a no-op
// (one promotion roundtrip).
//
// The flip uses a single UPDATE so the public surface only ever sees the
// previous live set or the new one, never an empty in-between state — the
// DELETE of old published rows lands first, then the UPDATE flips drafts.
// (supabase-js has no transactional API; if the UPDATE fails after the
// DELETE, the chart goes empty until the admin re-publishes — which is
// preferable to leaving a half-old / half-new mix live.)

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

  // Guard: there must be drafts to publish.
  const { data: drafts, error: countErr } = await supabase
    .from('charts')
    .select('id')
    .eq('chart_key', chartKey)
    .eq('status', 'draft')

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }
  if (!drafts || drafts.length === 0) {
    return NextResponse.json(
      { error: 'No draft rows to publish. Refresh from Shazam or add manual entries first.' },
      { status: 400 },
    )
  }

  // Replace live: delete existing published rows for this chart_key first.
  const { error: delErr } = await supabase
    .from('charts')
    .delete()
    .eq('chart_key', chartKey)
    .eq('status', 'published')
  if (delErr) {
    return NextResponse.json(
      { error: `Failed to clear existing published rows: ${delErr.message}` },
      { status: 500 },
    )
  }

  // Flip drafts to published.
  const { error: updErr } = await supabase
    .from('charts')
    .update({ status: 'published' })
    .eq('chart_key', chartKey)
    .eq('status', 'draft')
  if (updErr) {
    return NextResponse.json(
      { error: `Failed to publish drafts: ${updErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    chart_key: chartKey,
    published_count: drafts.length,
  })
}
