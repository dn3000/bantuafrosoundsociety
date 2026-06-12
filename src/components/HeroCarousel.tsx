'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

export type HeroCarouselItem = {
  id: string
  type: 'release' | 'playlist' | 'video' | 'article'
  title: string
  subtitle: string
  imageUrl: string
  href: string
}

const AUTO_MS = 5500

const TYPE_LABEL: Record<HeroCarouselItem['type'], string> = {
  release: 'Release',
  playlist: 'Playlist',
  video: 'Video',
  article: 'Article',
}

type Cfg = { tx: number; ty: number; s: number; ry: number; z: number; br: number }

// Progressive coverflow transforms indexed by |relativePosition|
const DESKTOP: Cfg[] = [
  { tx:   0, ty:  0, s: 1.00, ry:  0, z: 20, br: 1.00 },
  { tx: 200, ty:  8, s: 0.85, ry: 22, z: 10, br: 0.75 },
  { tx: 365, ty: 16, s: 0.72, ry: 35, z:  0, br: 0.55 },
]
const MOBILE: Cfg[] = [
  { tx:   0, ty:  0, s: 1.00, ry:  0, z: 20, br: 1.00 },
  { tx: 148, ty:  6, s: 0.82, ry: 26, z: 10, br: 0.70 },
]

function cardTransform(rel: number, mob: boolean): React.CSSProperties {
  const abs = Math.abs(rel)
  const sgn = rel < 0 ? -1 : 1
  const table = mob ? MOBILE : DESKTOP
  if (abs >= table.length) return { visibility: 'hidden', pointerEvents: 'none' }
  const c = table[abs]
  return {
    transform: `translateX(${sgn * c.tx}px) translateY(${c.ty}px) scale(${c.s}) rotateY(${-sgn * c.ry}deg)`,
    zIndex: c.z,
    filter: `brightness(${c.br})`,
    visibility: 'visible',
    pointerEvents: 'auto',
  }
}

// Shortest-path wrapped relative position
function wrapRel(idx: number, active: number, n: number): number {
  const raw = idx - active
  const half = Math.floor(n / 2)
  if (raw > half) return raw - n
  if (raw < -half) return raw + n
  return raw
}

export function HeroCarousel({ items, caption }: { items: HeroCarouselItem[]; caption?: string }) {
  const n = items.length
  const [active, setActive] = useState(0)
  const [mob, setMob] = useState(false)
  const [paused, setPaused] = useState(false)
  const [noMotion, setNoMotion] = useState(false)
  const dragX = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setMob(mq.matches)
    const h = (e: MediaQueryListEvent) => setMob(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

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

  // Card geometry
  const CARD_W = mob ? 200 : 260
  const CARD_H = mob ? 270 : 340
  const STAGE_H = mob ? 308 : 382

  return (
    <section
      className="mb-14"
      aria-label="Featured content"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={e => { dragX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (dragX.current === null) return
        const dx = e.changedTouches[0].clientX - dragX.current
        dragX.current = null
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
      }}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      }}
    >
      {/* Mobile caption — shown above stage on narrow screens */}
      {caption && (
        <p className="sm:hidden text-center text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4">
          {caption}
        </p>
      )}

      {/* 3D stage */}
      <div
        className="relative overflow-hidden"
        style={{ height: STAGE_H, perspective: '1200px', perspectiveOrigin: '50% 50%' }}
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item, idx) => {
          const rel = wrapRel(idx, active, n)
          const isActive = idx === active
          const xfm = cardTransform(rel, mob)

          return (
            <div
              key={item.id}
              style={{
                width: CARD_W,
                height: CARD_H,
                position: 'absolute',
                top: '50%',
                left: '50%',
                marginLeft: -CARD_W / 2,
                marginTop: -CARD_H / 2,
                borderRadius: 16,
                overflow: 'hidden',
                transition: noMotion ? 'none' : 'transform 360ms cubic-bezier(0.4,0,0.2,1), filter 360ms ease',
                ...xfm,
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${idx + 1} of ${n}: ${item.title}`}
              aria-hidden={Math.abs(rel) > (mob ? 1 : 2)}
            >
              {isActive ? (
                <Link
                  href={item.href}
                  className="block w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]"
                  aria-label={`Open ${item.title}`}
                >
                  <CardFace item={item} active />
                </Link>
              ) : (
                <button
                  className="block w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]"
                  tabIndex={Math.abs(rel) === 1 ? 0 : -1}
                  onClick={() => setActive(idx)}
                  aria-label={`Go to: ${item.title}`}
                >
                  <CardFace item={item} active={false} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Pill-dot navigation */}
      <div className="flex items-center justify-center gap-1.5 mt-4" role="tablist" aria-label="Carousel slides">
        {items.map((item, idx) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={idx === active}
            aria-label={`Slide ${idx + 1}: ${item.title}`}
            onClick={() => setActive(idx)}
            className="flex-none rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
            style={{
              width: idx === active ? 18 : 6,
              height: 6,
              background: idx === active
                ? 'var(--color-accent)'
                : 'var(--color-border-strong)',
            }}
          />
        ))}
      </div>
    </section>
  )
}

// ── Card face (image + scrim + labels + play button) ─────────────────────────

function CardFace({ item, active }: { item: HeroCarouselItem; active: boolean }) {
  return (
    <div className="relative w-full h-full bg-[var(--color-bg-higher)]">
      {/* Cover image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.title}
        className="w-full h-full object-cover"
        loading={active ? 'eager' : 'lazy'}
      />

      {/* Bottom gradient scrim on active card only */}
      {active && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.84) 0%, rgba(0,0,0,0.28) 48%, transparent 100%)',
          }}
        />
      )}

      {/* Content type badge */}
      <div className="absolute top-3 left-3">
        <span
          className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(0,0,0,0.52)',
            color: 'var(--color-fg-secondary)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {TYPE_LABEL[item.type]}
        </span>
      </div>

      {/* Active card: title + subtitle + play */}
      {active && (
        <>
          <div className="absolute bottom-0 left-0 right-14 p-4 pointer-events-none">
            <p
              className="text-[var(--color-fg-primary)] font-bold leading-snug line-clamp-2 mb-0.5"
              style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem' }}
            >
              {item.title}
            </p>
            <p
              className="text-[var(--color-fg-secondary)] text-xs line-clamp-1"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {item.subtitle}
            </p>
          </div>

          <div className="absolute bottom-4 right-4 pointer-events-none">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                background: 'var(--color-accent)',
                color: 'var(--color-fg-primary)',
              }}
              aria-hidden
            >
              {/* Play triangle */}
              <svg
                width="12"
                height="13"
                viewBox="0 0 12 13"
                fill="currentColor"
                style={{ marginLeft: 2 }}
              >
                <path d="M2 1.5l9 5-9 5V1.5z" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
