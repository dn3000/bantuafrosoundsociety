// Site footer — full-bleed terracotta band sitting outside the page's
// max-w-5xl content column. Big white wordmark + copyright on the left;
// Account / Explore / Follow groups on the right.
//
// Social glyphs come from react-icons/si (Simple Icons) so they render as
// single-colour vector text — sharper and brand-faithful (real TikTok / X
// shapes) compared to filtered raster brand SVGs.

import Link from 'next/link'
import type { IconType } from 'react-icons'
import {
  SiInstagram,
  SiFacebook,
  SiTiktok,
  SiX,
  SiThreads,
} from 'react-icons/si'

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
const SOCIALS: { name: string; href: string; Icon: IconType }[] = [
  { name: 'Instagram', href: '#', Icon: SiInstagram },
  { name: 'Facebook',  href: '#', Icon: SiFacebook  },
  { name: 'TikTok',    href: '#', Icon: SiTiktok   },
  { name: 'X',         href: '#', Icon: SiX        },
  { name: 'Threads',   href: '#', Icon: SiThreads  },
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
    <footer className="bg-[var(--color-accent)] text-white -mb-28 md:mb-0">
      <div className="max-w-5xl mx-auto px-6 pt-12 pb-28 md:pb-12">
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
                    <s.Icon
                      size={20}
                      aria-hidden
                      className="text-white opacity-90 hover:opacity-100 transition-opacity"
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
