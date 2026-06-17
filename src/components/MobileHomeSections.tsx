// Homepage sample sections — rendered at both breakpoints. Mobile sizing
// is vw-based for peek-overflow; desktop sizing uses pixel widths (or
// max-widths for the non-scrolling lists). Server components — pure CSS
// scroll-snap, no client JS. Sample data is TEMPORARY and gets swapped out
// once each section's backend lands.

import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { SectionTitle } from './SectionTitle'
import { MediaCardRow, type MediaCardItem } from './MediaCardRow'
import { SCROLL_TRACK } from './scrollTrack'

// ── GENRE IMAGE CARDS ────────────────────────────────────────────────────────
// Horizontal carousel of photo tiles, each labelled with the genre name.
// Cards are display-only until the genre filter backend lands.

type Genre = { name: string; cover: string }

const GENRES: Genre[] = [
  { name: 'Afro House', cover: '/brand/afrohouse.png' },
  { name: 'Amapiano',   cover: '/brand/amapiano.png'  },
  { name: 'Gqom',       cover: '/brand/gqom.png'      },
  { name: 'Afro Tech',  cover: '/brand/afrotech.png'  },
  { name: '3-Step',     cover: '/brand/3step.png'     },
  { name: 'Deep House', cover: '/brand/deephouse.png' },
  { name: 'Soulful',    cover: '/brand/soulful.png'   },
  { name: 'Bacardi',    cover: '/brand/bacardi.png'   },
]

export function MobileGenrePills() {
  return (
    <div className={`mb-8 md:mb-14 flex gap-3 snap-x ${SCROLL_TRACK}`}>
      {GENRES.map((genre) => (
        <div
          key={genre.name}
          className="relative shrink-0 snap-start w-[150px] h-[90px] rounded-[12px] overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={genre.cover}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <span
            className="absolute bottom-2 left-2.5 right-2.5 text-white text-sm font-bold leading-tight line-clamp-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {genre.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── BASS MADE ────────────────────────────────────────────────────────────────
// In-house playlist row built on the reusable MediaCardRow. Items come from
// tracked_playlists where is_bass_made = true (see app/(public)/page.tsx).
// MediaCardRow already returns null on empty, so [] hides the row.

export function MobileBassMade({ items }: { items: MediaCardItem[] }) {
  return (
    <MediaCardRow
      title="BASS Made"
      href="#" // TODO route
      items={items}
      aspect="square"
      cardWidth="w-[42vw] md:w-44"
    />
  )
}

// ── BASS THIS WEEK ───────────────────────────────────────────────────────────
// Paged track list: columns are ~80vw wide so the next column peeks ~20% on
// the right, each column stacks 4 track rows. Items are curated in
// /admin/this-week (bass_this_week table); the page.tsx query resolves the
// submission join and passes the resolved list in. Returns null on empty.

export type BassThisWeekItem = {
  id: string
  title: string
  artist: string
  cover: string
  href: string
  // Submission-backed items go to internal /release/<id> pages; standalone
  // items (paste-a-link rows) point at arbitrary off-site URLs and open in
  // a new tab with rel="noopener noreferrer".
  external: boolean
}

const ROWS_PER_COLUMN = 4

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function BassThisWeekRow({ track, showDivider }: { track: BassThisWeekItem; showDivider: boolean }) {
  const rowClass = `flex items-center gap-3 py-2 ${
    showDivider ? 'border-b border-white/8' : ''
  }`
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={track.cover}
        alt={track.title}
        className="w-[52px] h-[52px] rounded-[8px] object-cover shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-fg-primary)] line-clamp-1">
          {track.title}
        </p>
        <p className="text-xs text-[var(--color-fg-secondary)] line-clamp-1 mt-0.5">
          {track.artist}
        </p>
      </div>
      {/* Decorative for now — becomes a track-menu trigger when backend lands. */}
      <MoreHorizontal
        size={20}
        className="text-[var(--color-fg-tertiary)] shrink-0"
        aria-hidden="true"
      />
    </>
  )
  return track.external ? (
    <a
      href={track.href}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass}
    >
      {inner}
    </a>
  ) : (
    <Link href={track.href} className={rowClass}>
      {inner}
    </Link>
  )
}

export function MobileBassThisWeek({
  items,
  weekLabel,
}: {
  items: BassThisWeekItem[]
  weekLabel: string
}) {
  if (items.length === 0) return null
  const columns = chunk(items, ROWS_PER_COLUMN)

  return (
    <section className="mb-10 md:mb-14">
      <SectionTitle title="BASS This Week" className="mb-1" />
      <p className="text-xs text-white/50 mb-3">{weekLabel}</p>
      <div className={`flex gap-3 snap-x snap-mandatory ${SCROLL_TRACK}`}>
        {columns.map((col, ci) => (
          <div key={ci} className="shrink-0 snap-start w-[80vw] md:w-[26rem]">
            {col.map((track, ri) => (
              <BassThisWeekRow
                key={track.id}
                track={track}
                showDivider={ri < col.length - 1}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── ARTIST SPOTLIGHT ─────────────────────────────────────────────────────────
// Hand-picked "artists to watch" — replaces the old auto Trending Artists row
// on mobile. Editorial, not algorithmic. 3:4 portrait covers. Items are
// curated in /admin/spotlight (artists.is_spotlight + spotlight_order); the
// page.tsx query selects them and builds descriptors via
// buildSpotlightDescriptor. MediaCardRow auto-hides on empty.

export function MobileArtistSpotlight({ items }: { items: MediaCardItem[] }) {
  return (
    <MediaCardRow
      title="Artist Spotlight"
      href="#" // TODO route → artists index
      items={items}
      aspect="portrait"
      cardWidth="w-[40vw] md:w-44"
    />
  )
}

// ── CHARTS ──────────────────────────────────────────────────────────────────
// Vertical ranked list — front-end placeholder; trend tooling feeds it later.
// Monochrome + single-accent: up = accent terracotta, down = white/40, same =
// white/30, new = accent outline pill. No green/red.
// TEMPORARY sample data + heading sub-line.

const CHARTS_SUBLINE = 'Top Afro House · this week'

type ChartTrack = {
  rank: number
  coverUrl: string
  title: string
  artist: string
  move: 'up' | 'down' | 'new' | 'same'
  delta?: number
}

const SAMPLE_CHART_TRACKS: ChartTrack[] = [
  { rank: 1, title: 'Sondela',           artist: 'DJ Stoks',         move: 'up',   delta: 2, coverUrl: 'https://picsum.photos/seed/ch-sondela/120/120' },
  { rank: 2, title: 'Asibe Happy',       artist: 'Kabza De Small',   move: 'same',           coverUrl: 'https://picsum.photos/seed/ch-asibe/120/120'   },
  { rank: 3, title: 'Ke Star',           artist: 'Focalistic',       move: 'up',   delta: 1, coverUrl: 'https://picsum.photos/seed/ch-kestar/120/120'  },
  { rank: 4, title: 'Don Dada',          artist: 'Kelvin Momo',      move: 'new',            coverUrl: 'https://picsum.photos/seed/ch-dondada/120/120' },
  { rank: 5, title: 'Ngiyazifela',       artist: 'Mas Musiq',        move: 'down', delta: 3, coverUrl: 'https://picsum.photos/seed/ch-ngiya/120/120'   },
  { rank: 6, title: "Themba's Lament",   artist: 'Themba',           move: 'up',   delta: 5, coverUrl: 'https://picsum.photos/seed/ch-themba/120/120'  },
  { rank: 7, title: 'Felele',            artist: 'De Mthuda',        move: 'down', delta: 1, coverUrl: 'https://picsum.photos/seed/ch-felele/120/120'  },
  { rank: 8, title: 'Khusela',           artist: 'Daliwonga',        move: 'same',           coverUrl: 'https://picsum.photos/seed/ch-khusela/120/120' },
]

function ChartTrendChip({ move, delta }: { move: ChartTrack['move']; delta?: number }) {
  if (move === 'up') {
    return (
      <span className="text-[var(--color-accent)] text-xs font-semibold tabular-nums shrink-0">
        ▲{delta ?? ''}
      </span>
    )
  }
  if (move === 'down') {
    return (
      <span className="text-white/40 text-xs font-semibold tabular-nums shrink-0">
        ▼{delta ?? ''}
      </span>
    )
  }
  if (move === 'new') {
    return (
      <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] border border-[var(--color-accent)] rounded-full px-1.5 py-0 shrink-0">
        NEW
      </span>
    )
  }
  return (
    <span className="text-white/30 text-sm shrink-0" aria-label="no change">
      –
    </span>
  )
}

function ChartRow({ track, showDivider }: { track: ChartTrack; showDivider: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 ${
        showDivider ? 'border-b border-white/8' : ''
      }`}
    >
      <span
        className="w-6 text-center text-[15px] font-bold text-white/40 shrink-0"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {track.rank}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={track.coverUrl}
        alt={track.title}
        className="w-[46px] h-[46px] rounded-[8px] object-cover shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white line-clamp-1">
          {track.title}
        </p>
        <p className="text-xs text-white/50 line-clamp-1 mt-0.5">
          {track.artist}
        </p>
      </div>
      <ChartTrendChip move={track.move} delta={track.delta} />
    </div>
  )
}

export function MobileCharts() {
  if (SAMPLE_CHART_TRACKS.length === 0) return null
  return (
    <section className="mb-10 md:mb-14">
      <Link href="#" className="block">
        {/* TODO route → /charts */}
        <SectionTitle title="Charts" className="mb-1" />
      </Link>
      <p className="text-xs text-white/50 mb-3">{CHARTS_SUBLINE}</p>
      <div className="md:max-w-2xl">
        {SAMPLE_CHART_TRACKS.map((track, i) => (
          <ChartRow
            key={track.rank}
            track={track}
            showDivider={i < SAMPLE_CHART_TRACKS.length - 1}
          />
        ))}
      </div>
    </section>
  )
}

// ── EVENTS ───────────────────────────────────────────────────────────────────
// Portrait poster cards; date carried as the existing badge pill (top-left).
// Items resolve in page.tsx from the events table (status='published' AND
// event_date >= now()). MediaCardRow hides on empty, so the row disappears
// when no upcoming events are scheduled.

export function MobileEvents({ items }: { items: MediaCardItem[] }) {
  return (
    <MediaCardRow
      title="Events"
      href="/events"
      items={items}
      aspect="portrait"
      cardWidth="w-[52vw] md:w-52"
    />
  )
}

// ── BUY MERCH ────────────────────────────────────────────────────────────────
// Square product cards with Rand prices in the subtitle slot.
// TEMPORARY sample data — replaced once the merch backend lands.

const SAMPLE_MERCH: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'mr-1', title: 'BASS Logo Tee',       subtitle: 'R350', imageUrl: 'https://picsum.photos/seed/mr-tee/400/400',     href: '#' },
  { id: 'mr-2', title: 'Embroidered Cap',     subtitle: 'R250', imageUrl: 'https://picsum.photos/seed/mr-cap/400/400',     href: '#' },
  { id: 'mr-3', title: 'Tour Hoodie',         subtitle: 'R750', imageUrl: 'https://picsum.photos/seed/mr-hoodie/400/400',  href: '#' },
  { id: 'mr-4', title: 'Canvas Tote',         subtitle: 'R200', imageUrl: 'https://picsum.photos/seed/mr-tote/400/400',    href: '#' },
  { id: 'mr-5', title: 'Sticker Pack',        subtitle: 'R80',  imageUrl: 'https://picsum.photos/seed/mr-stickers/400/400', href: '#' },
  { id: 'mr-6', title: 'Knit Beanie',         subtitle: 'R220', imageUrl: 'https://picsum.photos/seed/mr-beanie/400/400',  href: '#' },
]

export function MobileMerch() {
  return (
    <MediaCardRow
      title="Buy Merch"
      href="#" // TODO route
      items={SAMPLE_MERCH}
      aspect="square"
      cardWidth="w-[42vw] md:w-44"
    />
  )
}
