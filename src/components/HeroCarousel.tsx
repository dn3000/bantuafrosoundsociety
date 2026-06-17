'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'

export type HeroCarouselItem = {
  id: string
  type: 'release' | 'playlist' | 'video' | 'article'
  kicker: string
  headline: string
  imageUrl: string
  typeBadge: string
  title: string
  artist: string
  date: string
  href: string
}

const AUTO_MS = 5500
const FADE_MS = 350

// prefers-reduced-motion as an external store: SSR-safe (server assumes motion
// is allowed) and avoids a setState-in-effect. Drives the slide-transition layer.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function HeroCarousel({ items }: { items: HeroCarouselItem[] }) {
  const n = items.length

  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  // prefers-reduced-motion (SSR snapshot = false, i.e. motion allowed)
  const noMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false)

  // Mobile scroll container ref
  const scrollRef = useRef<HTMLDivElement>(null)

  const go = useCallback((dir: 1 | -1) => setActive(i => (i + dir + n) % n), [n])

  // Desktop: hover / focus / keyboard
  const desktopInteract = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus:      () => setPaused(true),
    onBlur:       () => setPaused(false),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1)  }
    },
  }

  // Unified auto-advance: mobile scrolls natively, desktop uses go(1)
  useEffect(() => {
    if (paused || noMotion) return
    const id = setInterval(() => {
      const el = scrollRef.current
      const isMobile = window.innerWidth < 768
      if (isMobile && el) {
        const cw = el.offsetWidth * 0.8 + 12
        el.scrollTo({ left: el.scrollLeft + cw, behavior: 'smooth' })
      } else {
        go(1)
      }
    }, AUTO_MS)
    return () => clearInterval(id)
  }, [paused, noMotion, go])

  // Mobile: skip past the left clone on mount so item[0] is shown first
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.offsetWidth * 0.8 + 12
  }, [])

  // Mobile: scrollend → handle infinite-loop jump + sync active index
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let tid: ReturnType<typeof setTimeout>

    const onEnd = () => {
      const cw = el.offsetWidth * 0.8 + 12
      const idx = Math.round(el.scrollLeft / cw)
      if (idx <= 0) {
        // Snapped to left clone (copy of last item) → jump to real last
        el.scrollLeft = n * cw
        setActive(n - 1)
      } else if (idx >= n + 1) {
        // Snapped to right clone (copy of first item) → jump to real first
        el.scrollLeft = cw
        setActive(0)
      } else {
        setActive(idx - 1)
      }
    }

    if ('onscrollend' in window) {
      el.addEventListener('scrollend', onEnd)
      return () => el.removeEventListener('scrollend', onEnd)
    }
    // Fallback: debounced scroll event
    const onScroll = () => { clearTimeout(tid); tid = setTimeout(onEnd, 150) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(tid) }
  }, [n])

  // [clone-of-last, item0, item1, …, itemN-1, clone-of-first]
  const clonedItems = [items[n - 1], ...items, items[0]]

  // Swift, subtle crossfade applied in sync to the image + text + NEXT strip.
  // Reduced motion → swaps are instant (no transition). Single source of truth
  // for the slide-transition layer.
  const crossfade = noMotion ? 'none' : `opacity ${FADE_MS}ms ease-out`

  return (
    <section
      className="mb-14"
      aria-label="Featured content"
      aria-roledescription="carousel"
      {...desktopInteract}
    >

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP  md+  — two-column editorial panel; slides crossfade in place
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden md:flex rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)', minHeight: 390 }}
        aria-live="polite"
        aria-atomic="false"
      >

        {/* Left ½ — image, crossfades in sync with the text (opacity only) */}
        <div className="flex-shrink-0 flex p-3" style={{ width: '48%' }}>
          <Link
            href={items[active].href}
            className="flex-1 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
            style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', display: 'block' }}
            aria-label={`Open ${items[active].title}`}
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="absolute inset-0"
                style={{
                  opacity: idx === active ? 1 : 0,
                  zIndex: idx === active ? 1 : 0,
                  transition: crossfade,
                }}
                aria-hidden={idx !== active}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={idx === active ? item.title : ''}
                  className="w-full h-full object-cover object-top"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </Link>
        </div>

        {/* Right ½ — text + NEXT strip. Both regions stack every slide into a
            single grid cell (grid-area 1/1), so each region's height is the max
            across all slides — constant regardless of the active index — and
            opacity crossfades between them. The card background + divider live
            outside the stacks, so they never fade. */}
        <div className="flex-1 flex flex-col min-w-0 p-5 gap-4">

          <div className="grid grid-cols-1">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 min-w-0"
                style={{ gridArea: '1 / 1', opacity: idx === active ? 1 : 0, transition: crossfade }}
                aria-hidden={idx !== active}
                inert={idx !== active}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                  style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
                >
                  {item.kicker}
                </p>
                <Link href={item.href} className="focus:outline-none focus-visible:underline">
                  {/* Reserve exactly 2 lines (2 × leading-snug 1.375 = 2.75em):
                      1-line titles sit top-aligned with space below; 3+ clamp
                      with ellipsis. Keeps the panel geometry fixed across slides. */}
                  <h2
                    className="font-bold leading-snug line-clamp-2 min-h-[2.75em]"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.0625rem',
                      color: 'var(--color-fg-primary)',
                    }}
                  >
                    {item.headline}
                  </h2>
                </Link>
                <div className="flex flex-col gap-0.5 mt-1">
                  <TypeBadge>{item.typeBadge}</TypeBadge>
                  <p
                    className="font-bold text-sm leading-snug"
                    style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-heading)' }}
                  >
                    {item.title}
                  </p>
                  <p
                    className="text-sm leading-snug"
                    style={{ color: 'var(--color-fg-secondary)', fontFamily: 'var(--font-sans)' }}
                  >
                    {item.artist}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
                  >
                    {item.date}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1" />
          <div className="h-px flex-shrink-0" style={{ background: 'var(--color-border-default)' }} />

          {/* NEXT strip — the label is static; only the 3 cards crossfade */}
          <div>
            <p
              className="text-[9px] uppercase tracking-[0.12em] font-bold mb-2.5"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
            >
              NEXT
            </p>
            <div className="grid grid-cols-1">
              {items.map((slide, idx) => (
                <div
                  key={slide.id}
                  className="min-w-0"
                  style={{ gridArea: '1 / 1', opacity: idx === active ? 1 : 0, transition: crossfade }}
                  aria-hidden={idx !== active}
                  inert={idx !== active}
                >
                  <div className="flex gap-2.5">
                    {[1, 2, 3].map(offset => {
                      const item = items[(idx + offset) % n]
                      return (
                        <Link
                          key={`next-${offset}`}
                          href={item.href}
                          className="flex-1 min-w-0 group focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)] rounded-[8px]"
                          role="group"
                          aria-roledescription="slide"
                          aria-label={`${offset + 1} ahead: ${item.title}`}
                        >
                          <div
                            className="overflow-hidden mb-1.5 group-hover:opacity-80 transition-opacity duration-[var(--animate-fast)]"
                            style={{ borderRadius: 8, aspectRatio: '1 / 1' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <p
                            className="text-[11px] font-semibold leading-snug line-clamp-2 mb-0.5"
                            style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-sans)' }}
                          >
                            {item.title}
                          </p>
                          <p
                            className="text-[10px] mb-1.5"
                            style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
                          >
                            {item.date}
                          </p>
                          <TypeBadge small>{item.typeBadge}</TypeBadge>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE  below md  — CSS scroll-snap swipe carousel
          Cards live in a real horizontal scroll container so swiping moves
          all of them simultaneously — no pop-in, no crossfade, full scrub.
          Layout: [clone-last │ item0 │ item1 … │ clone-first]
          scrollend snaps the clones back to their real counterparts.
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        ref={scrollRef}
        className="md:hidden flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          overflowX: 'scroll',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          gap: 12,
        }}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        aria-live="polite"
        aria-atomic="false"
      >
        {clonedItems.map((item, i) => {
          const isClone = i === 0 || i === clonedItems.length - 1
          const realIdx = i === 0 ? n - 1 : i === clonedItems.length - 1 ? 0 : i - 1
          const isActive = !isClone && active === realIdx

          return (
            <div
              key={`${item.id}-${i}`}
              style={{ width: '80%', flexShrink: 0, scrollSnapAlign: 'start' }}
              role={isClone ? undefined : 'group'}
              aria-roledescription={isClone ? undefined : 'slide'}
              aria-label={isClone ? undefined : `${realIdx + 1} of ${n}: ${item.headline}`}
              aria-hidden={!isActive}
            >
              {/* Kicker */}
              <p
                className="text-[9px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
              >
                {item.kicker}
              </p>

              {/* Headline — reserve 2 lines so card images align across the row */}
              <p
                className="font-bold leading-snug line-clamp-2 min-h-[2.75em] mb-2.5"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.875rem',
                  color: 'var(--color-fg-primary)',
                }}
              >
                {item.headline}
              </p>

              {/* Square image + badge */}
              <Link
                href={item.href}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]"
                style={{
                  display: 'block',
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
                tabIndex={isActive ? 0 : -1}
                aria-label={`Open ${item.title}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover object-top"
                  loading={isActive ? 'eager' : 'lazy'}
                />
                <div className="absolute bottom-3 left-3">
                  <TypeBadge variant="filled">{item.typeBadge}</TypeBadge>
                </div>
              </Link>

              {/* Metadata below image */}
              <p
                className="font-bold text-sm leading-snug mt-2 mb-0.5"
                style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-heading)' }}
              >
                {item.title}
              </p>
              <p
                className="text-sm leading-snug mb-0.5"
                style={{ color: 'var(--color-fg-secondary)', fontFamily: 'var(--font-sans)' }}
              >
                {item.artist}
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
              >
                {item.date}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({
  children,
  variant = 'outline',
  small,
}: {
  children: React.ReactNode
  variant?: 'outline' | 'filled'
  small?: boolean
}) {
  const filled = variant === 'filled'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 'fit-content',
        fontSize: small ? '0.5625rem' : '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: filled ? 'var(--color-accent)' : 'transparent',
        color: filled ? 'var(--color-fg-primary)' : 'var(--color-accent)',
        border: filled ? 'none' : '1.5px solid var(--color-accent)',
        borderRadius: 'var(--radius-full)',
        paddingLeft: small ? 6 : 8,
        paddingRight: small ? 6 : 8,
        paddingTop: filled ? 2 : 1,
        paddingBottom: filled ? 2 : 1,
        lineHeight: 1.4,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </span>
  )
}
