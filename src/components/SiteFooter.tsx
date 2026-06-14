// Site footer — responsive layout, dark theme, terracotta column-header
// accents. Stacks on mobile; wordmark/socials on the left, two link columns
// on the right at md+. Bottom-nav clearance is handled at the layout level
// (pb-28 md:pb-0 in (public)/layout.tsx).

import Link from 'next/link'

// TODO — wire to real social URLs
const SOCIALS = [
  { name: 'Instagram', href: '#', src: '/brand/instagram.svg' },
  { name: 'Facebook',  href: '#', src: '/brand/facebook.svg'  },
  // Filename has a real typo on disk — 'tiiktok' (double i).
  { name: 'TikTok',    href: '#', src: '/brand/tiiktok.svg'   },
  { name: 'X',         href: '#', src: '/brand/X.svg'         },
  { name: 'Threads',   href: '#', src: '/brand/threads.svg'   },
]

// TODO route — link targets
const EXPLORE_LINKS = [
  { label: 'Listen', href: '#' },
  { label: 'Watch',  href: '#' },
  { label: 'Read',   href: '#' },
]

const BASS_LINKS = [
  { label: 'About',   href: '#' },
  { label: 'Submit',  href: '#' },
  { label: 'Contact', href: '#' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 pt-10 mt-4">
      <div className="flex flex-col gap-8 md:flex-row md:justify-between md:items-start">
        {/* Left: wordmark + tagline + socials */}
        <div className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.svg"
            alt="BASS"
            className="h-10 w-auto"
            loading="lazy"
          />
          <p className="text-white/50 text-sm">
            South African Afro House, curated.
          </p>
          <div className="flex items-center gap-4 mt-1">
            {SOCIALS.map((s) => (
              <Link
                key={s.name}
                href={s.href}
                aria-label={s.name}
                className="opacity-70 hover:opacity-100 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5"
                  loading="lazy"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* Right: two link columns */}
        <div className="grid grid-cols-2 gap-8 md:gap-16">
          <div>
            <h3
              className="text-sm font-bold mb-3 text-[var(--color-accent)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Explore
            </h3>
            <ul className="flex flex-col gap-2">
              {EXPLORE_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-white/70 hover:text-white text-sm transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3
              className="text-sm font-bold mb-3 text-[var(--color-accent)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              BASS
            </h3>
            <ul className="flex flex-col gap-2">
              {BASS_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-white/70 hover:text-white text-sm transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="border-t border-white/10 mt-10 pt-5 text-white/40 text-xs">
        © 2026 Bantu Afro Sound Society
      </div>
    </footer>
  )
}
