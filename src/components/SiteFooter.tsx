// Site footer — full-bleed terracotta band sitting outside the page's
// max-w-5xl content column. Big white wordmark + copyright on the left;
// Account / Explore / Follow groups on the right.
//
// Social SVGs are coloured-on-disk; brightness-0 + invert forces them to
// white so they read against the terracotta background.

import Link from 'next/link'

type FooterLink = { label: string; href: string }

const ACCOUNT_LINKS: FooterLink[] = [
  { label: 'Profile', href: '/profile' },
  { label: 'Saved',   href: '/saved'   },
  { label: 'Sign In', href: '/admin/login' },
]

const EXPLORE_LINKS: FooterLink[] = [
  { label: 'Listen', href: '#' }, // TODO route
  { label: 'Watch',  href: '#' }, // TODO route
  { label: 'Read',   href: '/read' },
  { label: 'Submit', href: '#' }, // TODO route
  { label: 'About',  href: '#' }, // TODO route
]

// TODO — wire to real social URLs
const SOCIALS = [
  { name: 'Instagram', href: '#', src: '/brand/instagram.svg' },
  { name: 'Facebook',  href: '#', src: '/brand/facebook.svg'  },
  // Filename has a real typo on disk — 'tiiktok' (double i).
  { name: 'TikTok',    href: '#', src: '/brand/tiiktok.svg'   },
  { name: 'X',         href: '#', src: '/brand/X.svg'         },
  { name: 'Threads',   href: '#', src: '/brand/threads.svg'   },
]

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-white text-sm font-bold uppercase tracking-wide mb-3"
      style={{ fontFamily: 'var(--font-heading)' }}
    >
      {children}
    </h3>
  )
}

function LinkList({ items }: { items: FooterLink[] }) {
  return (
    <ul>
      {items.map((l) => (
        <li key={l.label}>
          <Link
            href={l.href}
            className="text-white/80 hover:text-white text-sm block py-1 transition-colors"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SiteFooter() {
  return (
    <footer className="bg-[var(--color-accent)] text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between md:items-start">
          {/* Left — big wordmark + copyright */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.svg"
              alt="BASS"
              className="h-24 md:h-28 w-auto"
              loading="lazy"
            />
            <p className="text-white/80 text-xs mt-4">
              © 2026 BantuAfroSoundSociety.com
            </p>
          </div>

          {/* Right — three groups */}
          <div className="grid grid-cols-2 gap-8 md:flex md:flex-row md:gap-12">
            <div>
              <GroupHeader>Account</GroupHeader>
              <LinkList items={ACCOUNT_LINKS} />
            </div>
            <div>
              <GroupHeader>Explore</GroupHeader>
              <LinkList items={EXPLORE_LINKS} />
            </div>
            <div className="col-span-2 md:col-auto">
              <GroupHeader>Follow</GroupHeader>
              <div className="flex items-center gap-4">
                {SOCIALS.map((s) => (
                  <Link
                    key={s.name}
                    href={s.href}
                    aria-label={s.name}
                    className="inline-flex"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.src}
                      alt=""
                      aria-hidden="true"
                      className="h-5 w-5 brightness-0 invert opacity-90 hover:opacity-100 transition-opacity"
                      loading="lazy"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
