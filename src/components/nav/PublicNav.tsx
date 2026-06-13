'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  House, User, Heart, Music4, Menu,
  ChevronDown, X, BookOpen, Calendar, ShoppingBag, Info, Tv, LogIn,
} from 'lucide-react'

const PRIMARY = [
  { href: '/profile', label: 'Profile', Icon: User   },
  { href: '/saved',   label: 'Saved',   Icon: Heart  },
  { href: '/',        label: 'Home',    Icon: House  },
  { href: '/search',  label: 'Explore', Icon: Music4 },
] as const

const MORE = [
  { href: '/watch', label: 'Watch', Icon: Tv },
  { href: '/read', label: 'Read', Icon: BookOpen },
  { href: '/events', label: 'Events', Icon: Calendar },
  { href: '/merch', label: 'Merch', Icon: ShoppingBag },
  { href: '/about', label: 'About', Icon: Info },
] as const

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

export function PublicNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 bg-[var(--color-bg-elevated)] border-r border-white/10 z-40"
      >
        {/* Wordmark */}
        <div className="px-5 py-6 border-b border-white/10">
          <Link
            href="/"
            className="font-heading text-xl font-bold tracking-tight text-[var(--color-fg-primary)] hover:text-[var(--color-accent)] transition-colors"
          >
            BASS
          </Link>
        </div>

        {/* Primary nav */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-0.5">
            {PRIMARY.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                        : 'text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5'
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* More accordion */}
          <div className="mt-3">
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-3">
                <Menu size={18} strokeWidth={1.5} />
                More
              </span>
              <ChevronDown
                size={15}
                className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {moreOpen && (
              <ul className="mt-0.5 ml-9 space-y-0.5">
                {MORE.map(({ href, label, Icon }) => {
                  const active = isActive(pathname, href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] text-sm transition-colors ${
                          active
                            ? 'text-[var(--color-accent)]'
                            : 'text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5'
                        }`}
                      >
                        <Icon size={15} strokeWidth={1.5} />
                        {label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ───────────────────────── */}
      <style>{`
        .glass-nav-mobile {
          background: rgba(18, 18, 18, 0.92);
        }
        @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
          .glass-nav-mobile {
            background: rgba(18, 18, 18, 0.55);
            backdrop-filter: blur(18px) saturate(1.4);
            -webkit-backdrop-filter: blur(18px) saturate(1.4);
          }
        }
      `}</style>
      <nav
        aria-label="Main navigation"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        className="glass-nav-mobile md:hidden fixed left-4 right-4 z-40 rounded-[24px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        <ul className="flex h-14 px-2">
          {PRIMARY.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href)
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors ${
                    active
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-fg-secondary)]'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                  <span>{label}</span>
                </Link>
              </li>
            )
          })}

          {/* More tab */}
          <li className="flex-1">
            <button
              onClick={() => setSheetOpen(true)}
              className="flex flex-col items-center justify-center w-full h-full gap-0.5 text-[10px] font-medium text-[var(--color-fg-secondary)]"
            >
              <Menu size={20} strokeWidth={1.5} />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* ── Mobile bottom sheet ─────────────────────────── */}
      {sheetOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--color-bg-elevated)] rounded-t-[var(--radius-xl)] border-t border-white/10"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-[var(--color-fg-primary)]">
                More
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <ul className="px-3 pb-3 space-y-0.5">
              {MORE.map(({ href, label, Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setSheetOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius)] text-base font-medium transition-colors ${
                        active
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5'
                      }`}
                    >
                      <Icon size={20} strokeWidth={1.5} />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Sign in — separated from nav links */}
            <div className="px-3 pb-10 pt-1 border-t border-white/10">
              <Link
                href="/admin/login"
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius)] text-base font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors"
              >
                <LogIn size={20} strokeWidth={1.5} />
                Sign In
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  )
}
