// Reusable horizontal card carousel.
//
// Server component — pure CSS scroll-snap, no client JS. Generic and
// props-driven: pass a `title` and an `items` array; any row (New Releases,
// editorial picks, etc.) can reuse it. Renders nothing when `items` is empty,
// matching the homepage's empty editorial slots.

export type CarouselItem = {
  id: string
  /** Small uppercase category label shown above the artwork, e.g. "ALBUM". */
  label: string
  /** Artwork fallback chain: artwork_url → cover_image_url → artist_image_url → initials. */
  artwork_url?: string | null
  cover_image_url?: string | null
  artist_image_url?: string | null
  title: string
  /** Muted line under the title, e.g. the artist name. */
  subtitle?: string | null
  /** Meta line, e.g. "ALBUM · May 2026". */
  meta?: string | null
  /** Link target; opens in a new tab like the existing homepage items. */
  href: string
}

// ── Image helpers (same fallback chain as the homepage) ─────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getImageSrc(item: CarouselItem): string | null {
  if (isRenderableImage(item.artwork_url)) return item.artwork_url!
  if (isRenderableImage(item.cover_image_url)) return item.cover_image_url!
  if (isRenderableImage(item.artist_image_url)) return item.artist_image_url!
  return null
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function CardArtwork({ item }: { item: CarouselItem }) {
  const src = getImageSrc(item)
  const base = 'rounded-[var(--radius-md)] object-cover w-full h-full'

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={item.title} className={base} loading="lazy" />
  }

  return (
    <div className="rounded-[var(--radius-md)] w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-base select-none">
      {getInitials(item.title)}
    </div>
  )
}

// ── Carousel ────────────────────────────────────────────────────────────────

export function CardCarousel({
  title,
  items,
  className,
}: {
  title: string
  items: CarouselItem[]
  /** Optional spacing/utility classes for the outer section (e.g. "mb-14"). */
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <section className={className}>
      {/* Section label in the "→ TITLE" style used across the homepage. */}
      <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4 flex items-center gap-1.5">
        <span className="text-[var(--color-accent)]" aria-hidden>→</span>
        {title}
      </h2>

      {/* Horizontally scrollable row: scroll-snap on mobile/desktop, scrollbar
          hidden cross-browser via Tailwind arbitrary variants. */}
      <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group shrink-0 snap-start w-40 sm:w-44"
          >
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-1.5 truncate">
              {item.label}
            </p>
            <div className="aspect-square rounded-[var(--radius-md)] overflow-hidden mb-2">
              <CardArtwork item={item} />
            </div>
            <p className="text-sm font-semibold text-[var(--color-fg-primary)] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
              {item.title}
            </p>
            {item.subtitle && (
              <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
                {item.subtitle}
              </p>
            )}
            {item.meta && (
              <p className="text-[11px] text-[var(--color-fg-tertiary)] truncate mt-1">
                {item.meta}
              </p>
            )}
          </a>
        ))}
      </div>
    </section>
  )
}
