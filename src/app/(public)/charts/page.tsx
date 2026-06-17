export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

const CHART_KEY = 'shazam-za-dance'
const CHART_TITLE = 'South Africa · Dance'
const CHART_SUBTITLE = 'Top tracks this week'
const SOURCE_CREDIT = 'Source: Shazam'

export const metadata: Metadata = {
  title: 'Charts | BASS',
  description: 'The most-Shazamed dance tracks in South Africa.',
}

type PublishedRow = {
  id: string
  position: number
  title: string
  artist_name: string
  artwork_url: string | null
  apple_music_url: string | null
  artist_id: string | null
  source: string
  captured_at: string | null
}

function formatAsOf(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function getInitials(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export default async function ChartsPage() {
  const supabase = await createClient()

  // RLS guarantees only status='published' rows are returned to anon.
  const { data: rowsRaw } = await supabase
    .from('charts')
    .select('id, position, title, artist_name, artwork_url, apple_music_url, artist_id, source, captured_at')
    .eq('chart_key', CHART_KEY)
    .eq('status', 'published')
    .order('position', { ascending: true })

  const rows = (rowsRaw ?? []) as PublishedRow[]

  // Resolve roster artist slugs in a single follow-up query so the table can
  // hyperlink artist names where the admin matched them. Rows without a
  // matched artist render artist_name as plain text.
  const artistIds = rows.map((r) => r.artist_id).filter((id): id is string => !!id)
  const artistSlugById: Record<string, { slug: string; name: string }> = {}
  if (artistIds.length > 0) {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, slug, name')
      .in('id', artistIds)
    for (const a of (artists ?? []) as Array<{ id: string; slug: string; name: string }>) {
      artistSlugById[a.id] = { slug: a.slug, name: a.name }
    }
  }

  const asOf = rows.length > 0 ? formatAsOf(rows[0].captured_at) : null

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-2">
          Charts
        </p>
        <h1
          className="text-3xl sm:text-4xl font-bold leading-tight text-[var(--color-fg-primary)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {CHART_TITLE}
        </h1>
        <p className="text-sm text-[var(--color-fg-secondary)] mt-2">{CHART_SUBTITLE}</p>
        <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-[var(--color-fg-tertiary)]">
          {asOf && <span>as of {asOf}</span>}
          <span aria-hidden="true">·</span>
          <span>{SOURCE_CREDIT}</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center text-sm text-[var(--color-fg-tertiary)] italic">
          The chart is being prepared. Check back soon.
        </div>
      ) : (
        <ol className="space-y-1">
          {rows.map((row) => {
            const matched = row.artist_id ? artistSlugById[row.artist_id] : null
            return (
              <li
                key={row.id}
                className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3 flex items-center gap-3"
              >
                <span
                  className="w-8 text-center text-base font-bold text-white/40 tabular-nums shrink-0"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {row.position}
                </span>

                {row.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.artwork_url}
                    alt={row.title}
                    className="w-12 h-12 rounded-[8px] object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-[8px] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)] shrink-0">
                    {getInitials(row.title)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--color-fg-primary)] line-clamp-1">
                    {row.title}
                  </p>
                  <p className="text-xs text-[var(--color-fg-secondary)] line-clamp-1 mt-0.5">
                    {matched ? (
                      <Link
                        href={`/artist/${matched.slug}`}
                        className="hover:text-[var(--color-accent)] transition-colors"
                      >
                        {row.artist_name}
                      </Link>
                    ) : (
                      row.artist_name
                    )}
                  </p>
                </div>

                {row.apple_music_url && (
                  <a
                    href={row.apple_music_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors shrink-0 px-2 py-1 border border-[var(--color-border-default)] rounded-full"
                  >
                    Apple Music
                  </a>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
