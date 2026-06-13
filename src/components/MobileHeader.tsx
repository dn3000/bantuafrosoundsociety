'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

const STORAGE_KEY = 'bass_banner_dismissed'

// TODO before production: replace each badge with the platform's official
// "Listen on" lockup per Apple Music Identity Guidelines, Spotify Brand
// Guidelines, YouTube Music Brand Guidelines, and SoundCloud Creator Resources.
const PLATFORMS: { name: string; href: string; color: string }[] = [
  { name: 'Apple Music',   href: 'https://music.apple.com',   color: '#FC3C44' },
  { name: 'Spotify',       href: 'https://open.spotify.com',  color: '#1DB954' },
  { name: 'YouTube Music', href: 'https://music.youtube.com', color: '#FF0000' },
  { name: 'SoundCloud',    href: 'https://soundcloud.com',    color: '#FF5500' },
]

export function MobileHeader() {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true')
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  // Render nothing until localStorage is read to avoid SSR/hydration flicker
  if (dismissed === null) return null

  return (
    <header
      className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4"
      style={{
        height: 56,
        background: 'var(--color-bg-elevated)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* BASS logo — swap src if you place the SVG at a different path */}
      <Link href="/" className="flex-shrink-0" aria-label="BASS home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="BASS" className="h-7 w-auto" loading="eager" />
      </Link>

      {/* Hairline separator */}
      <div
        className="flex-shrink-0 self-stretch"
        style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '10px 0' }}
        aria-hidden="true"
      />

      {/* Right region: dismissable promo banner → platform badge marquee */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {!dismissed ? (
          <div className="flex items-center gap-2">
            <p
              className="text-[11px] leading-tight line-clamp-2 flex-1 min-w-0"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-fg-secondary)' }}
            >
              <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>WIN TICKETS</span>
              {' '}to: Black Coffee — July 6, 2026
            </p>
            <button
              onClick={dismiss}
              aria-label="Dismiss banner"
              className="flex-shrink-0 p-1 rounded-full text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          /* Fade edges mask so badges glide in/out smoothly */
          <div
            className="overflow-hidden"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}
          >
            {/* Double the list so the -50% translateX loops seamlessly */}
            <div className="flex gap-3 items-center bass-marquee-track">
              {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                <Link
                  key={i}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 whitespace-nowrap text-[11px] font-semibold px-2.5 py-1 rounded-full hover:opacity-75 transition-opacity"
                  style={{
                    color: p.color,
                    border: `1px solid ${p.color}55`,
                    background: `${p.color}1A`,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
