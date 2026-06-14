// Mobile-only homepage sections (md:hidden):
//   MobileGenrePills    — horizontal scroll of photo-card genre tiles, no section title.
//   MobileBassMade      — in-house playlist row ("BASS Made ›"), built on MediaCardRow.
//   MobileBassThisWeek  — paged columns of stacked track rows ("BASS This Week ›") with date sub-line.
//
// Server components — pure CSS scroll-snap, no client JS. Front-end only this
// slice: sample data is TEMPORARY and gets swapped out once each section's
// backend lands. Desktop layout is unaffected — every export wraps itself in
// md:hidden.

import { MoreHorizontal } from 'lucide-react'
import { SectionTitle } from './SectionTitle'
import { MediaCardRow, type MediaCardItem } from './MediaCardRow'
import { SCROLL_TRACK } from './scrollTrack'

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

// ── BASS MADE ────────────────────────────────────────────────────────────────
// In-house playlist row built on the reusable MediaCardRow.
// TEMPORARY sample playlists — replaced once the playlists backend lands.

const SAMPLE_BASS_MADE: MediaCardItem[] = [
  // TODO route — /playlists doesn't exist yet, individual hrefs stub to "#"
  { id: 'bm-1', title: 'Sunday Reset',       subtitle: 'BASS · 24 tracks', imageUrl: 'https://picsum.photos/seed/bm-sunday/400/400',     href: '#' },
  { id: 'bm-2', title: 'Late Set Energy',    subtitle: 'BASS · 31 tracks', imageUrl: 'https://picsum.photos/seed/bm-lateset/400/400',    href: '#' },
  { id: 'bm-3', title: 'Bantu Futures',      subtitle: 'BASS · 18 tracks', imageUrl: 'https://picsum.photos/seed/bm-bantu/400/400',      href: '#' },
  { id: 'bm-4', title: 'Continental Cool',   subtitle: 'BASS · 26 tracks', imageUrl: 'https://picsum.photos/seed/bm-continental/400/400', href: '#' },
  { id: 'bm-5', title: 'Diaspora Sounds',    subtitle: 'BASS · 22 tracks', imageUrl: 'https://picsum.photos/seed/bm-diaspora/400/400',   href: '#' },
  { id: 'bm-6', title: 'After Hours',        subtitle: 'BASS · 29 tracks', imageUrl: 'https://picsum.photos/seed/bm-afterhours/400/400', href: '#' },
]

export function MobileBassMade() {
  return (
    <MediaCardRow
      title="BASS Made"
      href="#" // TODO route
      items={SAMPLE_BASS_MADE}
      aspect="square"
      cardWidth="w-[42vw]"
    />
  )
}

// ── BASS THIS WEEK ───────────────────────────────────────────────────────────
// Paged track list: columns are ~80vw wide so the next column peeks ~20% on
// the right, each column stacks 4 track rows.
// TEMPORARY sample tracks — replaced once the BASS This Week backend lands.

// TEMPORARY sample date — will be derived from the playlist's publish date.
const BASS_THIS_WEEK_DATE = 'Week of June 9, 2026'

type SampleTrack = {
  id: string
  title: string
  artist: string
  cover: string
}

const SAMPLE_BASS_THIS_WEEK_TRACKS: SampleTrack[] = [
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

function BassThisWeekRow({ track, showDivider }: { track: SampleTrack; showDivider: boolean }) {
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

export function MobileBassThisWeek() {
  const columns = chunk(SAMPLE_BASS_THIS_WEEK_TRACKS, ROWS_PER_COLUMN)
  if (columns.length === 0) return null

  return (
    <section className="md:hidden mb-10">
      <SectionTitle title="BASS This Week" className="mb-1" />
      <p className="text-xs text-white/50 mb-3">{BASS_THIS_WEEK_DATE}</p>
      <div className={`flex gap-3 snap-x snap-mandatory ${SCROLL_TRACK}`}>
        {columns.map((col, ci) => (
          <div key={ci} className="shrink-0 snap-start w-[80vw]">
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

// ── BASS SETS ────────────────────────────────────────────────────────────────
// BASS's own live recorded sets — 16:9 thumbnails with a duration pill.
// TEMPORARY sample data — replaced once the sets backend lands.

const SAMPLE_BASS_SETS: MediaCardItem[] = [
  // TODO route — /sets doesn't exist yet, individual hrefs stub to "#"
  { id: 'bset-1', title: 'BASS Live 014 — Rooftop Sessions',    subtitle: 'Jun 2026', durationLabel: '1h 22m', imageUrl: 'https://picsum.photos/seed/bset-014/640/360', href: '#' },
  { id: 'bset-2', title: 'BASS Live 013 — Sunset Pavilion',     subtitle: 'May 2026', durationLabel: '56m',    imageUrl: 'https://picsum.photos/seed/bset-013/640/360', href: '#' },
  { id: 'bset-3', title: 'BASS Live 012 — Underground Lagos',   subtitle: 'Apr 2026', durationLabel: '1h 47m', imageUrl: 'https://picsum.photos/seed/bset-012/640/360', href: '#' },
  { id: 'bset-4', title: 'BASS Live 011 — Joburg After Dark',   subtitle: 'Apr 2026', durationLabel: '2h 04m', imageUrl: 'https://picsum.photos/seed/bset-011/640/360', href: '#' },
  { id: 'bset-5', title: 'BASS Live 010 — Dakar Riverside',     subtitle: 'Mar 2026', durationLabel: '1h 11m', imageUrl: 'https://picsum.photos/seed/bset-010/640/360', href: '#' },
  { id: 'bset-6', title: 'BASS Live 009 — Nairobi Warehouse',   subtitle: 'Mar 2026', durationLabel: '1h 35m', imageUrl: 'https://picsum.photos/seed/bset-009/640/360', href: '#' },
]

export function MobileBassSets() {
  return (
    <MediaCardRow
      title="BASS Sets"
      href="#" // TODO route
      items={SAMPLE_BASS_SETS}
      aspect="video"
      cardWidth="w-[62vw]"
    />
  )
}

// ── ARTIST SPOTLIGHT ─────────────────────────────────────────────────────────
// Hand-picked "artists to watch" — replaces the old auto Trending Artists row
// on mobile. Editorial, not algorithmic. 3:4 portrait covers.
// TEMPORARY sample data — replaced once the editorial artist picks backend lands.

const SAMPLE_ARTIST_SPOTLIGHT: MediaCardItem[] = [
  // TODO route → artists index — individual hrefs stub to "#"
  { id: 'as-1', title: 'Lebo Khoza',        subtitle: 'Soweto · Afro Tech',       imageUrl: 'https://picsum.photos/seed/as-lebo/400/533',   href: '#' },
  { id: 'as-2', title: 'Thandi Mbeki',      subtitle: 'Pretoria · Soulful House', imageUrl: 'https://picsum.photos/seed/as-thandi/400/533', href: '#' },
  { id: 'as-3', title: 'DJ Sipho',          subtitle: 'Durban · Gqom',            imageUrl: 'https://picsum.photos/seed/as-sipho/400/533',  href: '#' },
  { id: 'as-4', title: 'Tumi Mokoena',      subtitle: 'Cape Town · Amapiano',     imageUrl: 'https://picsum.photos/seed/as-tumi/400/533',   href: '#' },
  { id: 'as-5', title: 'Nala Khumalo',      subtitle: 'Joburg · Deep House',      imageUrl: 'https://picsum.photos/seed/as-nala/400/533',   href: '#' },
  { id: 'as-6', title: 'Sello Mahlangu',    subtitle: 'Mamelodi · 3 Step',        imageUrl: 'https://picsum.photos/seed/as-sello/400/533',  href: '#' },
]

export function MobileArtistSpotlight() {
  return (
    <MediaCardRow
      title="Artist Spotlight"
      href="#" // TODO route → artists index
      items={SAMPLE_ARTIST_SPOTLIGHT}
      aspect="portrait"
      cardWidth="w-[40vw]"
    />
  )
}
