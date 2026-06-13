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

// Shortest-path wrapped relative position — unchanged
function wrapRel(idx: number, active: number, n: number): number {
  const raw = idx - active
  const half = Math.floor(n / 2)
  if (raw > half) return raw - n
  if (raw < -half) return raw + n
  return raw
}

export function HeroCarousel({ items }: { items: HeroCarouselItem[] }) {
  const n = items.length

  // ── State & interaction logic — all unchanged ─────────────────────────────
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [noMotion, setNoMotion] = useState(false)
  const dragX = useRef<number | null>(null)

  // Text crossfade: displayActive lags 170 ms so right column fades out first
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

  useEffect(() => {
    if (paused || noMotion) return
    const id = setInterval(() => go(1), AUTO_MS)
    return () => clearInterval(id)
  }, [paused, noMotion, go])

  useEffect(() => {
    if (noMotion) { setDisplayActive(active); return }
    setTextOpacity(0)
    const t = setTimeout(() => { setDisplayActive(active); setTextOpacity(1) }, 170)
    return () => clearTimeout(t)
  }, [active, noMotion])

  const cur = items[displayActive]
  const curHref = items[active].href

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

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP  md+  — two-column editorial panel
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden md:flex rounded-[var(--radius-lg)] overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)', minHeight: 390 }}
        aria-live="polite"
        aria-atomic="false"
      >

        {/* Left ½ — inset image with rounded corners */}
        <div className="flex-shrink-0 flex p-3" style={{ width: '48%' }}>
          {/* Link wraps the rounded image frame; ring renders inside the frame */}
          <Link
            href={curHref}
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

        {/* Right ½ — text + NEXT strip */}
        <div className="flex-1 flex flex-col min-w-0 p-5 gap-4">

          {/* Active item text block — crossfades with displayActive */}
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
            <div className="flex flex-col gap-0.5 mt-1">
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Divider */}
          <div className="h-px flex-shrink-0" style={{ background: 'var(--color-border-default)' }} />

          {/* NEXT strip — no arrow, three evenly-sized cards */}
          <div style={fadeStyle}>
            <p
              className="text-[9px] uppercase tracking-[0.12em] font-bold mb-2.5"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
            >
              NEXT
            </p>
            <div className="flex gap-2.5">
              {[1, 2, 3].map(offset => {
                const item = items[(displayActive + offset) % n]
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
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE  below md  — left-anchored whole-card carousel, right peek
          Card width = 80% of container. Image = square (100% of card width =
          80% of container width). Container height = padding-bottom formula:
            80% (image) + 165px (kicker+headline+below-image text+gaps).
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="md:hidden relative overflow-hidden"
        style={{ height: 0, paddingBottom: 'calc(80% + 165px)' }}
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item, idx) => {
          const rel = wrapRel(idx, active, n)
          if (Math.abs(rel) > 1) return null

          const isActive = rel === 0
          // rel=-1 → off-screen left, rel=0 → active, rel=+1 → peek right (12px gap)
          const tx = rel === -1 ? 'calc(-100% - 12px)' : rel === 0 ? '0%' : 'calc(100% + 12px)'

          return (
            <div
              key={item.id}
              className="absolute top-0 left-0"
              style={{
                width: '80%',
                transform: `translateX(${tx})`,
                transition: noMotion ? 'none' : 'transform 360ms cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${idx + 1} of ${n}: ${item.headline}`}
              aria-hidden={!isActive}
            >
              {/* Kicker */}
              <p
                className="text-[9px] uppercase tracking-[0.12em] font-semibold mb-1.5"
                style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-sans)' }}
              >
                {item.kicker}
              </p>

              {/* Headline — 2-line clamp */}
              <p
                className="font-bold leading-snug line-clamp-2 mb-2.5"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.875rem',
                  color: 'var(--color-fg-primary)',
                }}
              >
                {item.headline}
              </p>

              {/* Square image — filled typeBadge overlaid bottom-left */}
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
                {/* Filled pill on image — legible against any cover art */}
                <div className="absolute bottom-3 left-3">
                  <TypeBadge variant="filled">{item.typeBadge}</TypeBadge>
                </div>
              </Link>

              {/* Below-image metadata — left-aligned */}
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

// ── TypeBadge pill ─────────────────────────────────────────────────────────────
// variant="outline" (default) — terracotta border + text, transparent fill
// variant="filled"            — solid terracotta, white text (for on-image use)

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
