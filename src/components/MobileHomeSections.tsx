// Mobile-only homepage sections (md:hidden):
//   MobileGenrePills   — horizontal scroll of grey filled pills, no section title.
//   MobileBassSelect   — paged columns of stacked track rows ("BASS Select ›").
//   MobileReleasesRow  — horizontal card carousel ("Releases ›").
//
// Server components — pure CSS scroll-snap, no client JS. Front-end only this
// slice: sample data is TEMPORARY and gets swapped out once each section's
// backend lands. Desktop layout is unaffected — every export wraps itself in
// md:hidden.

import { MoreHorizontal } from 'lucide-react'
import { SectionTitle } from './SectionTitle'

// Common horizontal-scroll utility classes: smooth swipe, scrollbar hidden
// cross-browser, edge-to-edge bleed off the page's px-4 padding.
const SCROLL_TRACK =
  'overflow-x-auto scroll-smooth py-1 -mx-4 px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

// ── GENRE IMAGE CARDS ────────────────────────────────────────────────────────
// Horizontal carousel of photo tiles, each labelled with the genre name.
// TEMPORARY: photos are picsum placeholders + cards are display-only until the
// genre filter backend lands. Swap photos for real genre art and wire each
// card to a filter at that point.

type SampleGenre = { name: string; cover: string }

const SAMPLE_GENRES: SampleGenre[] = [
  { name: 'Amapiano',      cover: 'https://picsum.photos/seed/genre-amapiano/300/180'  },
  { name: 'Gqom',          cover: 'https://picsum.photos/seed/genre-gqom/300/180'      },
  { name: '3 Step',        cover: 'https://picsum.photos/seed/genre-3step/300/180'     },
  { name: 'Afro House',    cover: 'https://picsum.photos/seed/genre-afrohouse/300/180' },
  { name: 'Deep House',    cover: 'https://picsum.photos/seed/genre-deephouse/300/180' },
  { name: 'Afro Tech',     cover: 'https://picsum.photos/seed/genre-afrotech/300/180'  },
  { name: 'Soulful House', cover: 'https://picsum.photos/seed/genre-soulful/300/180'   },
  { name: 'Bacardi',       cover: 'https://picsum.photos/seed/genre-bacardi/300/180'   },
]

export function MobileGenrePills() {
  return (
    <div className={`md:hidden mb-8 flex gap-3 snap-x ${SCROLL_TRACK}`}>
      {SAMPLE_GENRES.map((genre) => (
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

// ── BASS SELECT ──────────────────────────────────────────────────────────────
// Paged track list: columns are ~80vw wide so the next column peeks ~20% on
// the right, each column stacks 4 track rows.
// TEMPORARY sample tracks — replaced once the BASS Select backend lands.

type SampleTrack = {
  id: string
  title: string
  artist: string
  cover: string
}

const SAMPLE_BASS_SELECT_TRACKS: SampleTrack[] = [
  { id: 'bs-1',  title: 'Sondela',          artist: 'DJ Stoks',          cover: 'https://picsum.photos/seed/bs1/120/120' },
  { id: 'bs-2',  title: 'Ke Star',          artist: 'Focalistic',        cover: 'https://picsum.photos/seed/bs2/120/120' },
  { id: 'bs-3',  title: 'Don Dada',         artist: 'Kelvin Momo',       cover: 'https://picsum.photos/seed/bs3/120/120' },
  { id: 'bs-4',  title: 'Asibe Happy',      artist: 'Kabza De Small',    cover: 'https://picsum.photos/seed/bs4/120/120' },
  { id: 'bs-5',  title: "Themba's Lament",  artist: 'Themba',            cover: 'https://picsum.photos/seed/bs5/120/120' },
  { id: 'bs-6',  title: 'Khusela',          artist: 'Daliwonga',         cover: 'https://picsum.photos/seed/bs6/120/120' },
  { id: 'bs-7',  title: 'Akulaleki',        artist: 'Samthing Soweto',   cover: 'https://picsum.photos/seed/bs7/120/120' },
  { id: 'bs-8',  title: 'Ngiyazifela',      artist: 'Mas Musiq',         cover: 'https://picsum.photos/seed/bs8/120/120' },
  { id: 'bs-9',  title: 'Nguwe',            artist: 'Vigro Deep',        cover: 'https://picsum.photos/seed/bs9/120/120' },
  { id: 'bs-10', title: 'Felele',           artist: 'De Mthuda',         cover: 'https://picsum.photos/seed/bs10/120/120' },
]

const ROWS_PER_COLUMN = 4

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function BassSelectRow({ track, showDivider }: { track: SampleTrack; showDivider: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 py-2 ${
        showDivider ? 'border-b border-white/8' : ''
      }`}
    >
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
    </div>
  )
}

export function MobileBassSelect() {
  const columns = chunk(SAMPLE_BASS_SELECT_TRACKS, ROWS_PER_COLUMN)
  if (columns.length === 0) return null

  return (
    <section className="md:hidden mb-10">
      <SectionTitle title="BASS Select" />
      <div className={`flex gap-3 snap-x snap-mandatory ${SCROLL_TRACK}`}>
        {columns.map((col, ci) => (
          <div key={ci} className="shrink-0 snap-start w-[80vw]">
            {col.map((track, ri) => (
              <BassSelectRow
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

// ── RELEASES ─────────────────────────────────────────────────────────────────
// Card carousel — each card ~40vw so roughly 2.5 cards show at once.
// TEMPORARY sample releases — replaced once the Releases backend lands here.

type SampleRelease = {
  id: string
  title: string
  artist: string
  cover: string
}

const SAMPLE_RELEASES: SampleRelease[] = [
  { id: 'rel-1', title: 'Inkabi',       artist: 'Vusinator',         cover: 'https://picsum.photos/seed/rel1/400/400' },
  { id: 'rel-2', title: 'Lockdown',     artist: 'Zakes Bantwini',    cover: 'https://picsum.photos/seed/rel2/400/400' },
  { id: 'rel-3', title: 'Iphupho',      artist: 'Aymos',             cover: 'https://picsum.photos/seed/rel3/400/400' },
  { id: 'rel-4', title: 'Imali',        artist: 'DBN Gogo',          cover: 'https://picsum.photos/seed/rel4/400/400' },
  { id: 'rel-5', title: 'Sgudi Snysn',  artist: 'Sino Msolo',        cover: 'https://picsum.photos/seed/rel5/400/400' },
  { id: 'rel-6', title: 'Asambeni',     artist: 'Mr JazziQ',         cover: 'https://picsum.photos/seed/rel6/400/400' },
  { id: 'rel-7', title: 'Boikgantsho',  artist: 'Major League DJz',  cover: 'https://picsum.photos/seed/rel7/400/400' },
  { id: 'rel-8', title: 'Nomalanga',    artist: 'TxC',               cover: 'https://picsum.photos/seed/rel8/400/400' },
]

export function MobileReleasesRow() {
  if (SAMPLE_RELEASES.length === 0) return null

  return (
    <section className="md:hidden mb-10">
      <SectionTitle title="Releases" />
      <div className={`flex gap-3 ${SCROLL_TRACK}`}>
        {SAMPLE_RELEASES.map((rel) => (
          <div key={rel.id} className="shrink-0 w-[40vw]">
            <div className="aspect-square rounded-[8px] overflow-hidden mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rel.cover}
                alt={rel.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <p className="text-sm font-medium text-[var(--color-fg-primary)] line-clamp-1">
              {rel.title}
            </p>
            <p className="text-xs text-[var(--color-fg-secondary)] line-clamp-1 mt-0.5">
              {rel.artist}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
