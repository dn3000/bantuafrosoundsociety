'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
// Visible sliver width (px) from the adjacent image on mobile
const MOB_SLIVER = 28

// Shortest-path wrapped relative position — unchanged from original
function wrapRel(idx: number, active: number, n: number): number {
  const raw = idx - active
  const half = Math.floor(n / 2)
  if (raw > half) return raw - n
  if (raw < -half) return raw + n
  return raw
}

export function HeroCarousel({ items }: { items: HeroCarouselItem[] }) {
  const n = items.length

  // ── State (interaction logic unchanged from original) ─────────────────────
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [noMotion, setNoMotion] = useState(false)
  const dragX = useRef<number | null>(null)

  // Text crossfade: `displayActive` lags ~170 ms behind `active` so text
  // fades out before updating, then fades back in.
  const [displayActive, setDisplayActive] = useState(0)
  const [textOpacity, setTextOpacity] = useState(1)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setNoMotion(mq.matches)
    const h = (e: MediaQueryListEvent) => setNoMotion(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const go = useCallback((dir: 1 | -1) => setActive(i => (i + dir + n) % n), [n])

  // Auto-rotate — unchanged from original
  useEffect(() => {
    if (paused || noMotion) return
    const id = setInterval(() => go(1), AUTO_MS)
    return () => clearInterval(id)
  }, [paused, noMotion, go])

  // Text crossfade when active changes
  useEffect(() => {
    if (noMotion) { setDisplayActive(active); return }
    setTextOpacity(0)
    const t = setTimeout(() => { setDisplayActive(active); setTextOpacity(1) }, 170)
    return () => clearTimeout(t)
  }, [active, noMotion])

  const cur = items[displayActive]
  const curHref = items[active].href  // image link tracks `active`, not `displayActive`

  // Shared section event props — interaction logic unchanged from original
  const interact = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus:      () => setPaused(true),
    onBlur:       () => setPaused(false),
    onTouchStart: (e: React.TouchEvent) => { dragX.current = e.touches[0].clientX },
    onTouchEnd:   (e: React.TouchEvent) => {
      if (dragX.current === null) return
      const dx = e.changedTouches[0].clientX - dragX.current
      dragX.current = null
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1)  }
    },
  }

  const fadeStyle = {
    opacity: textOpacity,
    transition: noMotion ? 'none' : 'opacity 170ms ease',
  }

  return (
    <section
      className="mb-14"
      aria-label="Featured content"
      aria-roledescription="carousel"
      {...interact}
    >

      {/* ═══════════════════════════════════════════
          DESKTOP  md+  — two-column editorial panel
          ═══════════════════════════════════════════ */}
      <div
        className="hidden md:flex rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)', minHeight: 390 }}
        aria-live="polite"
        aria-atomic="false"
      >

        {/* Left ½ — image crossfade stack */}
        <div className="relative flex-shrink-0" style={{ width: '48%' }}>
          <Link
            href={curHref}
            className="block absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
            aria-label={`Open ${items[active].title}`}
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="absolute inset-0"
                style={{
                  opacity: idx === active ? 1 : 0,
                  zIndex: idx === active ? 1 : 0,
                  transition: noMotion ? 'none' : 'opacity 420ms ease',
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

        {/* Right ½ — text block + NEXT strip */}
        <div className="flex-1 flex flex-col min-w-0 p-5 gap-4">

          {/* Text block (fades with displayActive) */}
          <div className="flex flex-col gap-2" style={fadeStyle}>
            <p
              className="text-[10px] uppercase tracking-[0.12em] font-semibold"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
            >
              {cur.kicker}
            </p>
            <Link href={cur.href} className="focus:outline-none focus-visible:underline">
              <h2
                className="font-bold leading-snug line-clamp-3"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.0625rem',
                  color: 'var(--color-fg-primary)',
                }}
              >
                {cur.headline}
              </h2>
            </Link>
            <div className="flex flex-col gap-0.5 mt-0.5">
              <TypeBadge>{cur.typeBadge}</TypeBadge>
              <p
                className="font-bold text-sm leading-snug"
                style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-heading)' }}
              >
                {cur.title}
              </p>
              <p
                className="text-sm leading-snug"
                style={{ color: 'var(--color-fg-secondary)', fontFamily: 'var(--font-sans)' }}
              >
                {cur.artist}
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
              >
                {cur.date}
              </p>
            </div>
          </div>

          {/* Spacer pushes divider + NEXT strip to the bottom */}
          <div className="flex-1" />

          {/* Divider */}
          <div
            className="h-px flex-shrink-0"
            style={{ background: 'var(--color-border-subtle)' }}
          />

          {/* NEXT strip — updates with `active` (inside the fade div) */}
          <div style={fadeStyle}>
            <p
              className="text-[9px] uppercase tracking-[0.12em] font-bold mb-2.5"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
            >
              NEXT →
            </p>
            <div className="flex gap-2.5">
              {[1, 2, 3].map(offset => {
                const item = items[(displayActive + offset) % n]
                return (
                  <Link
                    key={`next-${offset}`}
                    href={item.href}
                    className="flex-1 min-w-0 group focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${offset + 1} ahead: ${item.title}`}
                  >
                    <div
                      className="overflow-hidden mb-1"
                      style={{ borderRadius: 8, aspectRatio: '1 / 1' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:opacity-75 transition-opacity duration-[var(--animate-fast)]"
                        loading="lazy"
                      />
                    </div>
                    <p
                      className="text-[11px] font-semibold leading-tight line-clamp-2 mb-0.5"
                      style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-sans)' }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="text-[10px] mb-1"
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
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MOBILE  below md  — centered vertical stack
          ═══════════════════════════════════════════ */}
      <div className="md:hidden" aria-live="polite" aria-atomic="false">

        {/* Kicker + headline */}
        <div className="text-center mb-3 px-2" style={fadeStyle}>
          <p
            className="text-[9px] uppercase tracking-[0.12em] font-semibold mb-1.5"
            style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
          >
            {cur.kicker}
          </p>
          <h2
            className="font-bold leading-snug line-clamp-3"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.9375rem',
              color: 'var(--color-fg-primary)',
            }}
          >
            {cur.headline}
          </h2>
        </div>

        {/* Image strip — darkened slivers of adjacent items on each edge */}
        <div className="relative overflow-hidden mb-3" style={{ aspectRatio: '1 / 1' }}>
          {items.map((item, idx) => {
            const rel = wrapRel(idx, active, n)
            if (Math.abs(rel) > 1) return null
            const isActive = rel === 0
            const tx = isActive
              ? '0px'
              : rel < 0
                ? `calc(-100% + ${MOB_SLIVER}px)`
                : `calc(100% - ${MOB_SLIVER}px)`
            return (
              <div
                key={item.id}
                className="absolute inset-0"
                style={{
                  transform: `translateX(${tx})`,
                  filter: isActive ? 'none' : 'brightness(0.32)',
                  transition: noMotion
                    ? 'none'
                    : 'transform 360ms cubic-bezier(0.4,0,0.2,1)',
                  zIndex: isActive ? 1 : 0,
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${idx + 1} of ${n}: ${item.title}`}
                aria-hidden={!isActive}
              >
                {isActive ? (
                  <Link
                    href={item.href}
                    className="block w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover object-top"
                      loading="eager"
                    />
                  </Link>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Title + artist + date + badge */}
        <div className="text-center px-4" style={fadeStyle}>
          <p
            className="font-bold text-sm leading-snug mb-0.5"
            style={{ color: 'var(--color-fg-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {cur.title}
          </p>
          <p
            className="text-sm mb-1.5"
            style={{ color: 'var(--color-fg-secondary)', fontFamily: 'var(--font-sans)' }}
          >
            {cur.artist}
          </p>
          <div className="flex items-center justify-center gap-2">
            <span
              className="text-xs"
              style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
            >
              {cur.date}
            </span>
            <TypeBadge small>{cur.typeBadge}</TypeBadge>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── TypeBadge pill ────────────────────────────────────────────────────────────

function TypeBadge({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: small ? '0.5625rem' : '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: 'var(--color-accent)',
        color: 'var(--color-fg-primary)',
        borderRadius: 'var(--radius-full)',
        paddingLeft: small ? 6 : 8,
        paddingRight: small ? 6 : 8,
        paddingTop: 2,
        paddingBottom: 2,
        lineHeight: 1.4,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </span>
  )
}
