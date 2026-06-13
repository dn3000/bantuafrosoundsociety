'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// TODO: re-enable localStorage persistence before production launch.
// Banner always reappears on reload for testing.

// Official streaming badge lockups — /public/brand/.
// TODO: verify each platform's current brand guidelines before launch.
const PLATFORMS = [
  { name: 'Spotify',       href: 'https://open.spotify.com',  src: '/brand/2024_Spotify_Logo.svg',  cls: 'h-6'  },
  { name: 'Apple Music',   href: 'https://music.apple.com',   src: '/brand/Apple_Music_logo.svg',   cls: 'h-6'  },
  { name: 'YouTube Music', href: 'https://music.youtube.com', src: '/brand/YouTube_Music_logo.svg', cls: 'h-6'  },
  { name: 'SoundCloud',    href: 'https://soundcloud.com',    src: '/brand/Soundcloud_logo.svg',    cls: 'h-4'  },
]

// TODO: replace # hrefs with official BASS social profile URLs before launch.
const SOCIALS: { name: string; href: string; Icon: React.ComponentType }[] = [
  { name: 'Instagram', href: '#', Icon: InstagramIcon },
  { name: 'Facebook',  href: '#', Icon: FacebookIcon  },
  { name: 'TikTok',    href: '#', Icon: TikTokIcon    },
  { name: 'X',         href: '#', Icon: XIcon         },
  { name: 'Threads',   href: '#', Icon: ThreadsIcon   },
]

export function MobileHeader() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <header
      className="md:hidden flex items-center gap-3 px-5"
      style={{ minHeight: 112 }}
    >
      {/* Full BASS logo — /brand/logo.svg (the decorative emblem + BANTU AFRO SOUND SOCIETY) */}
      <Link href="/" className="flex-shrink-0" aria-label="BASS home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="BASS" className="h-20 w-auto" loading="eager" />
      </Link>

      {/* Right region — no separator, left fade blends into the logo */}
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
          /* Platform + social marquee — fades into the logo on the left */
          <div
            className="overflow-hidden"
            style={{ maskImage: 'linear-gradient(to right, transparent, black 18%, black 100%)' }}
          >
            {/* Track is doubled so -50% translateX loops seamlessly */}
            <div className="flex gap-6 items-center bass-marquee-track">
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
                      <img src={p.src} alt={p.name} className={`${p.cls} w-auto`} loading="lazy" />
                    </Link>
                  ))}

                  {/* Visual divider between platforms and social */}
                  <span
                    className="flex-shrink-0 text-[var(--color-fg-tertiary)] select-none"
                    aria-hidden="true"
                    style={{ fontSize: 18 }}
                  >
                    ·
                  </span>

                  {/* "follow us" label — appears once per loop, before the icons */}
                  <span
                    className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
                    style={{ color: 'var(--color-fg-tertiary)', fontFamily: 'var(--font-sans)' }}
                    aria-hidden="true"
                  >
                    follow us
                  </span>

                  {/* Social icons — monotone BASS off-white */}
                  {SOCIALS.map(s => (
                    <Link
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-[var(--color-fg-primary)] hover:opacity-70 transition-opacity"
                      aria-label={`BASS on ${s.name}`}
                    >
                      <s.Icon />
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

// ─── Monotone social SVG icons ────────────────────────────────────────────────
// All use fill="currentColor" so the parent's text colour applies.

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.857L1.25 2.25H8.08l4.259 5.63L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  )
}

function ThreadsIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.852 1.205 8.604.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.012 5.318l-2.7.057c-.174-1.32-.73-2.49-1.611-3.188-1.097-.862-2.693-1.298-4.73-1.298h-.006c-2.493.018-4.382.783-5.614 2.274-1.024 1.244-1.6 3.09-1.615 5.437.015 2.35.591 4.19 1.615 5.434 1.232 1.49 3.12 2.254 5.614 2.272h.006c2.016 0 3.607-.434 4.71-1.296.887-.696 1.45-1.739 1.626-3.077-.638.048-1.285.073-1.942.073-1.558 0-3.069-.123-4.483-.37-2.61-.452-4.14-1.894-4.14-3.96 0-2.067 1.562-3.538 4.224-4.013 1.22-.213 2.644-.28 4.212-.2l.007-.001v-.63c0-1.268-.377-2.26-.962-2.919a3.04 3.04 0 0 0-2.265-.931c-.879 0-1.643.194-2.271.579-.62.38-1.053.957-1.255 1.693l-2.64-.556c.33-1.288 1.067-2.336 2.16-3.052 1.052-.69 2.363-1.054 3.837-1.054.956 0 1.881.175 2.752.52 2.176.855 3.363 2.723 3.363 5.21v.023l.003.01c-.003.255-.006.512-.012.765.012 0 .023-.002.035-.002.975 0 1.76.786 1.76 1.76v.003a1.76 1.76 0 0 1-1.76 1.757l-.001.001c-.053 0-.105-.003-.157-.007-.042 2.046-.705 3.69-1.963 4.867-1.368 1.275-3.24 1.922-5.565 1.922z" />
    </svg>
  )
}
