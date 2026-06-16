// Reusable horizontal artwork carousel — used by BASS Made, BASS Sets,
// Artist Spotlight, Podcasts, Events. Server component: pure CSS
// scroll-snap, cards are <Link>s, no client JS.
//
// Renders on both breakpoints; the responsive sizing is driven by the
// `cardWidth` prop (callers pass a mobile→md pair, e.g. "w-[42vw] md:w-44").
// SectionTitle sits above a horizontal snap track using the shared
// SCROLL_TRACK utility so the first card aligns flush with the title
// under the page's px-4 sm:px-6 gutter.

import Link from 'next/link'
import { SectionTitle } from './SectionTitle'
import { SCROLL_TRACK } from './scrollTrack'

export type MediaCardItem = {
  id: string
  title: string
  subtitle?: string
  imageUrl: string
  /** Omit (or pass "") to render the card as a non-interactive div — no
   * navigation, no pointer cursor. Used by Artist Spotlight, which has no
   * destination page yet. */
  href?: string
  badge?: string
  /** Short overlay label e.g. "1h 22m" — pill at bottom-right of cover. */
  durationLabel?: string
}

export function MediaCardRow({
  title,
  href,
  items,
  aspect = 'square',
  cardWidth = 'w-[42vw]',
}: {
  title: string
  /** Chevron "see all" target. */
  href: string
  items: MediaCardItem[]
  aspect?: 'square' | 'video' | 'portrait'
  /** Tailwind width class for each card. */
  cardWidth?: string
}) {
  if (items.length === 0) return null

  const aspectClass =
    aspect === 'video' ? 'aspect-video' : aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-square'

  return (
    <section className="mb-10 md:mb-14">
      {/* SectionTitle is an h2 — wrap it in a Link for the "see all" tap target. */}
      <Link href={href} className="block">
        <SectionTitle title={title} />
      </Link>
      <div className={`flex gap-3 ${SCROLL_TRACK}`}>
        {items.map((item) => {
          const cardClass = `shrink-0 ${cardWidth}`
          const inner = (
            <>
              <div className={`relative ${aspectClass} rounded-[8px] overflow-hidden mb-2`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {item.badge && (
                  <span className="absolute top-2 left-2 inline-block text-[10px] font-semibold uppercase tracking-wider text-white border border-white/40 rounded-full px-2 py-0.5 bg-black/30 backdrop-blur-sm">
                    {item.badge}
                  </span>
                )}
                {item.durationLabel && (
                  <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] leading-none px-1.5 py-0.5 rounded-[6px]">
                    {item.durationLabel}
                  </span>
                )}
              </div>
              <p className="text-[13px] font-medium text-white line-clamp-2 leading-snug">
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-xs text-white/50 line-clamp-1 mt-0.5">
                  {item.subtitle}
                </p>
              )}
            </>
          )
          // No href → render a plain div so the card shows but neither
          // navigates nor flips the cursor to a pointer on hover.
          return item.href ? (
            <Link key={item.id} href={item.href} className={cardClass}>
              {inner}
            </Link>
          ) : (
            <div key={item.id} className={cardClass}>
              {inner}
            </div>
          )
        })}
      </div>
    </section>
  )
}
