// Reusable video card + horizontal carousel for 16:9 YouTube content.
//
// Server component — pure CSS scroll-snap, no client JS. Two exports:
//   VideoCard     — standalone 16:9 card, reuse in any grid or list.
//   VideoCarousel — wraps VideoCard in the same scroll-snap track used by
//                   CardCarousel, with identical section-label style.

import Link from 'next/link'

export type VideoCarouselItem = {
  id: string
  title: string
  artist: string | null
  category: string
  thumbnail_url: string | null
  href: string
}

const CATEGORY_LABELS: Record<string, string> = {
  mix: 'Mix',
  live_set: 'Live Set',
  music_video: 'Music Video',
  interview: 'Interview',
  other: 'Other',
}

// ── PlayOverlay ──────────────────────────────────────────────────────────────

function PlayOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center group-hover:scale-110 transition-transform duration-[var(--animate-fast)]">
        {/* Filled play triangle */}
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white ml-0.5" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  )
}

// ── VideoCard ────────────────────────────────────────────────────────────────
// Standalone card — fills whatever width its parent gives it. Use inside a
// grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`) or inside VideoCarousel.

export function VideoCard({ item }: { item: VideoCarouselItem }) {
  return (
    <Link href={item.href} className="group block">
      {/* 16:9 thumbnail with centered play overlay */}
      <div className="relative aspect-video rounded-[8px] overflow-hidden mb-2 bg-[var(--color-bg-higher)]">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-[var(--color-fg-tertiary)] opacity-30" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        <PlayOverlay />
      </div>

      {/* Small category label */}
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-1 truncate">
        {CATEGORY_LABELS[item.category] ?? item.category}
      </p>

      {/* 2-line-clamped title */}
      <p className="text-sm font-semibold text-[var(--color-fg-primary)] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
        {item.title}
      </p>

      {/* Artist name */}
      {item.artist && (
        <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
          {item.artist}
        </p>
      )}
    </Link>
  )
}

// ── VideoCarousel ────────────────────────────────────────────────────────────
// Horizontal scroll-snap carousel matching the CardCarousel track structure.
// Cards are w-40 / sm:w-44 — narrower than a music card to let more peek
// through, since 16:9 thumbnails are naturally shorter than square artwork.

export function VideoCarousel({
  title,
  items,
  className,
}: {
  title: string
  items: VideoCarouselItem[]
  /** Optional spacing/utility classes for the outer section (e.g. "mb-14"). */
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <section className={className}>
      {/* "→ TITLE" section-label style used across the homepage */}
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4 flex items-center gap-1.5">
        <span className="text-[var(--color-accent)]" aria-hidden>→</span>
        {title}
      </h2>

      {/* Horizontally scrollable track: scroll-snap, scrollbar hidden */}
      <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div key={item.id} className="shrink-0 snap-start w-40 sm:w-44">
            <VideoCard item={item} />
          </div>
        ))}
      </div>
    </section>
  )
}
