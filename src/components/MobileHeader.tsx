'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// TODO: re-enable localStorage persistence before production launch.
// Banner always reappears on reload for testing.

const SCROLL_PX_PER_SEC = 25

// Official streaming badge lockups — /public/brand/.
// TODO: verify each platform's current brand guidelines before launch.
const PLATFORMS = [
  { name: 'Spotify',       href: 'https://open.spotify.com',  src: '/brand/2024_Spotify_Logo.svg',  cls: 'h-6'  },
  { name: 'Apple Music',   href: 'https://music.apple.com',   src: '/brand/Apple_Music_logo.svg',   cls: 'h-6'  },
  { name: 'YouTube Music', href: 'https://music.youtube.com', src: '/brand/YouTube_Music_logo.svg', cls: 'h-6'  },
  { name: 'SoundCloud',    href: 'https://soundcloud.com',    src: '/brand/Soundcloud_logo.svg',    cls: 'h-4'  },
]

// Social icons — SVGs placed in /public/brand/.
// Name each file exactly: instagram.svg  facebook.svg  tiktok.svg  x.svg  threads.svg
// TODO: replace # hrefs with official BASS social profile URLs before launch.
const SOCIALS = [
  { name: 'Instagram', href: '#', src: '/brand/instagram.svg' },
  { name: 'Facebook',  href: '#', src: '/brand/facebook.svg'  },
  { name: 'TikTok',    href: '#', src: '/brand/tiiktok.svg'   },
  { name: 'X',         href: '#', src: '/brand/X.svg'         },
  { name: 'Threads',   href: '#', src: '/brand/threads.svg'   },
]

export function MobileHeader() {
  const [dismissed, setDismissed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const interacting = useRef(false)
  const rafId = useRef(0)
  const lastTs = useRef(0)

  // JS-driven auto-scroll — runs only in the marquee state and respects
  // prefers-reduced-motion. Swipe/touch naturally interrupts via interacting flag.
  useEffect(() => {
    if (!dismissed) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return

    const el = trackRef.current
    if (!el) return

    function tick(ts: number) {
      // Re-read every frame so the loop point stays correct while images load in.
      const halfWidth = el!.scrollWidth / 2
      // Hold off until all images have loaded (content wider than the visible strip)
      if (halfWidth <= el!.clientWidth) {
        lastTs.current = 0
        rafId.current = requestAnimationFrame(tick)
        return
      }

      if (!interacting.current) {
        const delta = lastTs.current
          ? (ts - lastTs.current) * SCROLL_PX_PER_SEC / 1000
          : 0
        el!.scrollLeft += delta
        // Seamless loop: second half is identical to first half
        if (el!.scrollLeft >= halfWidth) el!.scrollLeft -= halfWidth
      }

      lastTs.current = ts
      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId.current)
      lastTs.current = 0
    }
  }, [dismissed])

  const pause  = () => { interacting.current = true }
  const resume = () => { interacting.current = false; lastTs.current = 0 }

  return (
    <header
      className="md:hidden flex items-center gap-3 px-5"
      style={{ minHeight: 112 }}
    >
      {/* Full BASS logo — /brand/logo.svg */}
      <Link href="/" className="flex-shrink-0" aria-label="BASS home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="BASS" className="h-20 w-auto" loading="eager" />
      </Link>

      {/* Right region */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {!dismissed ? (
          /* Dismissable promo banner */
          <div className="flex items-center gap-3">
            <p
              className="text-sm leading-snug flex-1 min-w-0"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-fg-secondary)' }}
            >
              <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>WIN TICKETS</span>
              {' '}to: Black Coffee — July 6, 2026
            </p>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
              className="flex-shrink-0 p-1.5 rounded-full text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          /* Swipeable + auto-scrolling marquee.
             Outer: overflow:hidden + fade mask (visual only).
             Inner: overflow-x:auto — naturally swipeable; JS drives auto-scroll. */
          <div
            className="overflow-hidden"
            style={{
              maskImage: 'linear-gradient(to right, transparent, black 18%, black 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 18%, black 100%)',
            }}
          >
            <div
              ref={trackRef}
              className="flex gap-6 items-center overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{ scrollBehavior: 'auto', touchAction: 'pan-x' }}
              onTouchStart={pause}
              onTouchEnd={resume}
              onMouseEnter={pause}
              onMouseLeave={resume}
            >
              {/* Content doubled so the half-width loop reset is seamless */}
              {[0, 1].map(pass => (
                <div key={pass} className="flex gap-6 items-center flex-shrink-0">

                  {/* Streaming platform badges */}
                  {PLATFORMS.map(p => (
                    <Link
                      key={p.name}
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 hover:opacity-70 transition-opacity"
                      aria-label={`Listen on ${p.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt={p.name} className={`${p.cls} w-auto`} loading="eager" />
                    </Link>
                  ))}

                  {/* Divider */}
                  <span
                    className="flex-shrink-0 select-none"
                    style={{ color: 'var(--color-fg-tertiary)', fontSize: 18 }}
                    aria-hidden="true"
                  >·</span>

                  {/* "follow us" — one label per loop cycle, before all 5 icons */}
                  <span
                    className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
                    style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
                    aria-hidden="true"
                  >
                    follow us
                  </span>

                  {/* Social icons — rendered as img with white filter.
                      Place SVG files in /public/brand/ with names listed in SOCIALS array. */}
                  {SOCIALS.map(s => (
                    <Link
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 hover:opacity-70 transition-opacity"
                      aria-label={`BASS on ${s.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.src}
                        alt={s.name}
                        width={20}
                        height={20}
                        loading="eager"
                      />
                    </Link>
                  ))}

                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
