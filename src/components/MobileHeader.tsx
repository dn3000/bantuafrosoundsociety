'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// TODO: re-enable localStorage persistence before production launch.
// Banner always reappears on reload during development/testing.

// Official streaming badge lockups from /public/brand/.
// TODO: verify each platform's brand guidelines before launch.
const PLATFORMS = [
  { name: 'Spotify',       href: 'https://open.spotify.com',  src: '/brand/2024_Spotify_Logo.svg',  cls: 'h-6'  },
  { name: 'Apple Music',   href: 'https://music.apple.com',   src: '/brand/Apple_Music_logo.svg',   cls: 'h-6'  },
  { name: 'YouTube Music', href: 'https://music.youtube.com', src: '/brand/YouTube_Music_logo.svg', cls: 'h-6'  },
  { name: 'SoundCloud',    href: 'https://soundcloud.com',    src: '/brand/Soundcloud_logo.svg',    cls: 'h-4'  },
]

export function MobileHeader() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <header
      className="md:hidden flex items-center gap-4 px-5"
      style={{ minHeight: 112 }}
    >
      {/* Square brand mark — /brand/logo-mark.svg */}
      <Link href="/" className="flex-shrink-0" aria-label="BASS home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.svg" alt="BASS" className="h-14 w-auto" loading="eager" />
      </Link>

      {/* Hairline separator */}
      <div
        className="flex-shrink-0 self-stretch"
        style={{ width: 1, background: 'rgba(255,255,255,0.12)', margin: '14px 0' }}
        aria-hidden="true"
      />

      {/* Right region — promo banner → platform badge marquee */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {!dismissed ? (
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
          /* Edges fade out so logos glide smoothly in/out */
          <div
            className="overflow-hidden"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)' }}
          >
            <div className="flex gap-8 items-center bass-marquee-track">
              {/* List doubled so the -50% translateX loops seamlessly */}
              {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                <Link
                  key={i}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 hover:opacity-70 transition-opacity"
                  aria-label={`Listen on ${p.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.name} className={`${p.cls} w-auto`} loading="lazy" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
