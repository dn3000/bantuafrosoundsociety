// Mobile-only homepage sections (md:hidden):
//   MobileGenrePills    — horizontal scroll of photo-card genre tiles, no section title.
//   MobileBassMade      — in-house playlist row ("BASS Made ›"), built on MediaCardRow.
//   MobileBassThisWeek  — paged columns of stacked track rows ("BASS This Week ›") with date sub-line.
//
// Server components — pure CSS scroll-snap, no client JS. Front-end only this
// slice: sample data is TEMPORARY and gets swapped out once each section's
// backend lands. Desktop layout is unaffected — every export wraps itself in
// md:hidden.

import Link from 'next/link'
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

// ── POPULAR PLAYLISTS ────────────────────────────────────────────────────────
// External (non-BASS) playlists trending on Spotify / Apple Music.
// TEMPORARY sample data — replaced once the external-playlists feed lands.

const SAMPLE_POPULAR_PLAYLISTS: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'pp-1', title: 'Afro House Heat',       subtitle: 'Spotify · 12k saves',     imageUrl: 'https://picsum.photos/seed/pp-heat/400/400',     href: '#' },
  { id: 'pp-2', title: 'Cape Town Sunsets',     subtitle: 'Spotify · 8.4k saves',    imageUrl: 'https://picsum.photos/seed/pp-sunsets/400/400',  href: '#' },
  { id: 'pp-3', title: 'Amapiano Essentials',   subtitle: 'Apple Music · 21k saves', imageUrl: 'https://picsum.photos/seed/pp-amapiano/400/400', href: '#' },
  { id: 'pp-4', title: 'Lagos Drive',           subtitle: 'DJ Tunde',                imageUrl: 'https://picsum.photos/seed/pp-lagos/400/400',    href: '#' },
  { id: 'pp-5', title: 'Township Hits 2026',    subtitle: 'Spotify · 6.2k saves',    imageUrl: 'https://picsum.photos/seed/pp-township/400/400', href: '#' },
  { id: 'pp-6', title: 'Soulful Sundays',       subtitle: 'Apple Music · 14k saves', imageUrl: 'https://picsum.photos/seed/pp-soulful/400/400',  href: '#' },
]

export function MobilePopularPlaylists() {
  return (
    <MediaCardRow
      title="Popular Playlists"
      href="#" // TODO route
      items={SAMPLE_POPULAR_PLAYLISTS}
      aspect="square"
      cardWidth="w-[42vw]"
    />
  )
}

// ── MUSIC VIDEOS ─────────────────────────────────────────────────────────────
// External official music videos — 16:9 thumbs with track-length duration pill.
// TEMPORARY sample data — replaced once the music-videos feed lands.

const SAMPLE_MUSIC_VIDEOS: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'mv-1', title: 'Tyla – Water (Official Video)',                 subtitle: 'Tyla',        durationLabel: '3:54', imageUrl: 'https://picsum.photos/seed/mv-water/640/360',       href: '#' },
  { id: 'mv-2', title: 'Burna Boy – City Boys (Official Video)',        subtitle: 'Burna Boy',   durationLabel: '4:12', imageUrl: 'https://picsum.photos/seed/mv-cityboys/640/360',    href: '#' },
  { id: 'mv-3', title: 'Tems – Free Mind (Official Video)',             subtitle: 'Tems',        durationLabel: '3:38', imageUrl: 'https://picsum.photos/seed/mv-freemind/640/360',    href: '#' },
  { id: 'mv-4', title: 'Davido – Unavailable (Official Video)',         subtitle: 'Davido',      durationLabel: '3:46', imageUrl: 'https://picsum.photos/seed/mv-unavailable/640/360', href: '#' },
  { id: 'mv-5', title: 'Asake – Lonely at the Top (Official Video)',    subtitle: 'Asake',       durationLabel: '2:54', imageUrl: 'https://picsum.photos/seed/mv-lonely/640/360',      href: '#' },
  { id: 'mv-6', title: 'Rema – Calm Down (Official Video)',             subtitle: 'Rema',        durationLabel: '4:21', imageUrl: 'https://picsum.photos/seed/mv-calmdown/640/360',    href: '#' },
]

export function MobileMusicVideos() {
  return (
    <MediaCardRow
      title="Music Videos"
      href="#" // TODO route
      items={SAMPLE_MUSIC_VIDEOS}
      aspect="video"
      cardWidth="w-[62vw]"
    />
  )
}

// ── PODCASTS ─────────────────────────────────────────────────────────────────
// External podcasts — square cover with episode-length duration pill.
// TEMPORARY sample data — replaced once the podcasts feed lands.

const SAMPLE_PODCASTS: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'pod-1', title: 'The Afro House Show — Ep. 42',     subtitle: 'with DJ Floyd',         durationLabel: '1h 02m', imageUrl: 'https://picsum.photos/seed/pod-afrohouse/400/400', href: '#' },
  { id: 'pod-2', title: 'Sounds of the Continent — Ep. 18', subtitle: 'with Lerato Khumalo',   durationLabel: '56m',    imageUrl: 'https://picsum.photos/seed/pod-continent/400/400', href: '#' },
  { id: 'pod-3', title: 'Mzansi Mixtape — Ep. 73',          subtitle: 'with DJ Stoks',         durationLabel: '1h 24m', imageUrl: 'https://picsum.photos/seed/pod-mzansi/400/400',    href: '#' },
  { id: 'pod-4', title: 'Diaspora Diaries — Ep. 09',        subtitle: 'with Ade Okoye',        durationLabel: '48m',    imageUrl: 'https://picsum.photos/seed/pod-diaspora/400/400', href: '#' },
  { id: 'pod-5', title: 'Late Night Lagos — Ep. 31',        subtitle: 'with Tobi Lou',         durationLabel: '1h 11m', imageUrl: 'https://picsum.photos/seed/pod-lagos/400/400',    href: '#' },
  { id: 'pod-6', title: 'The BASS Conversation — Ep. 5',    subtitle: 'with Sello Mahlangu',   durationLabel: '1h 38m', imageUrl: 'https://picsum.photos/seed/pod-bass/400/400',     href: '#' },
]

export function MobilePodcasts() {
  return (
    <MediaCardRow
      title="Podcasts"
      href="#" // TODO route
      items={SAMPLE_PODCASTS}
      aspect="video"
      cardWidth="w-[62vw]"
    />
  )
}

// ── LIVE SETS ────────────────────────────────────────────────────────────────
// External live sets / festival recordings — 16:9 thumbs with duration pill.
// TEMPORARY sample data — replaced once the live-sets feed lands.

const SAMPLE_LIVE_SETS: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'ls-1', title: 'Black Coffee @ Hï Ibiza 2026',              subtitle: 'Hï Ibiza',      durationLabel: '2h 14m', imageUrl: 'https://picsum.photos/seed/ls-bc-ibiza/640/360',   href: '#' },
  { id: 'ls-2', title: 'Major League DJz @ Fact Durban Rocks',      subtitle: 'Durban',        durationLabel: '1h 48m', imageUrl: 'https://picsum.photos/seed/ls-mldjz-fact/640/360', href: '#' },
  { id: 'ls-3', title: 'Uncle Waffles @ AfroNation Portugal',       subtitle: 'Lisbon',        durationLabel: '1h 33m', imageUrl: 'https://picsum.photos/seed/ls-waffles-an/640/360', href: '#' },
  { id: 'ls-4', title: 'Kabza De Small @ DStv Delicious Fest',      subtitle: 'Joburg',        durationLabel: '1h 56m', imageUrl: 'https://picsum.photos/seed/ls-kabza-dstv/640/360', href: '#' },
  { id: 'ls-5', title: 'DBN Gogo @ Cape Town Carnival',             subtitle: 'Cape Town',     durationLabel: '1h 22m', imageUrl: 'https://picsum.photos/seed/ls-dbngogo-ct/640/360', href: '#' },
  { id: 'ls-6', title: 'Themba @ Awakenings Amsterdam',             subtitle: 'Amsterdam',     durationLabel: '1h 41m', imageUrl: 'https://picsum.photos/seed/ls-themba-awk/640/360', href: '#' },
]

export function MobileLiveSets() {
  return (
    <MediaCardRow
      title="Live Sets"
      href="#" // TODO route
      items={SAMPLE_LIVE_SETS}
      aspect="video"
      cardWidth="w-[62vw]"
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
    <section className="md:hidden mb-10">
      <Link href="#" className="block">
        {/* TODO route → /charts */}
        <SectionTitle title="Charts" className="mb-1" />
      </Link>
      <p className="text-xs text-white/50 mb-3">{CHARTS_SUBLINE}</p>
      <div>
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
// TEMPORARY sample data — replaced once the events feed lands.

const SAMPLE_EVENTS: MediaCardItem[] = [
  // TODO route — individual hrefs stub to "#"
  { id: 'ev-1', title: 'Black Coffee Live',                  subtitle: 'CTICC · Cape Town',        badge: 'JUL 6',  imageUrl: 'https://picsum.photos/seed/ev-blackcoffee/400/533', href: '#' },
  { id: 'ev-2', title: 'Major League DJz: Soweto Edition',   subtitle: 'FNB Stadium · Soweto',     badge: 'AUG 14', imageUrl: 'https://picsum.photos/seed/ev-mldjz/400/533',       href: '#' },
  { id: 'ev-3', title: 'Uncle Waffles: Lagos Takeover',      subtitle: 'Eko Convention · Lagos',   badge: 'JUL 22', imageUrl: 'https://picsum.photos/seed/ev-waffles/400/533',     href: '#' },
  { id: 'ev-4', title: 'DBN Gogo at Moses Mabhida',          subtitle: 'Moses Mabhida · Durban',   badge: 'AUG 2',  imageUrl: 'https://picsum.photos/seed/ev-dbngogo/400/533',     href: '#' },
  { id: 'ev-5', title: 'Themba: Modern Africa Live',         subtitle: 'Carfax · Joburg',          badge: 'SEP 5',  imageUrl: 'https://picsum.photos/seed/ev-themba/400/533',      href: '#' },
  { id: 'ev-6', title: 'Kabza De Small: Europe Tour',        subtitle: 'Paradiso · Amsterdam',     badge: 'JUL 27', imageUrl: 'https://picsum.photos/seed/ev-kabza/400/533',       href: '#' },
]

export function MobileEvents() {
  return (
    <MediaCardRow
      title="Events"
      href="#" // TODO route
      items={SAMPLE_EVENTS}
      aspect="portrait"
      cardWidth="w-[52vw]"
    />
  )
}
