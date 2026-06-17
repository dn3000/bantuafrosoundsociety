'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Database,
  Disc,
  FileText,
  Layers,
  LayoutDashboard,
  ListMusic,
  Menu,
  Plug,
  Radio,
  SquarePlay,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'

const AUTH_ROUTES = ['/admin/login', '/admin/auth']

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean }
type NavGroup = { label: string | null; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/artists', label: 'Artists', icon: Users },
      { href: '/admin/submissions', label: 'Submissions', icon: FileText },
      { href: '/admin/videos', label: 'Videos', icon: Video },
      { href: '/admin/articles', label: 'Articles', icon: BookOpen },
      { href: '/admin/events', label: 'Events', icon: Calendar },
    ],
  },
  {
    label: 'Curation',
    items: [
      { href: '/admin/playlists', label: 'Playlists', icon: ListMusic },
      { href: '/admin/editorial', label: 'Editorial', icon: Layers },
    ],
  },
  {
    label: 'Ingestion',
    items: [
      { href: '/admin/scrapers', label: 'Scrapers', icon: Radio },
      { href: '/admin/integrations', label: 'Integrations', icon: Plug },
      { href: '/admin/youtube-spike', label: 'YouTube', icon: SquarePlay },
      { href: '/admin/artists/import', label: 'Import Artists', icon: UserPlus },
      { href: '/admin/artists/backfill', label: 'Artist Backfill', icon: Database },
      { href: '/admin/artists/musicbrainz', label: 'MusicBrainz', icon: Disc },
    ],
  },
]

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo + Admin badge */}
      <div className="px-4 py-5 border-b border-white/10 flex-shrink-0">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex items-center gap-3 group"
        >
          <Logo variant="mark" className="h-8 w-auto flex-shrink-0" priority />
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-base font-bold tracking-tight text-[var(--color-fg-primary)] group-hover:text-[var(--color-accent)] transition-colors">
              BASS
            </span>
            <span className="text-[10px] font-semibold tracking-widest uppercase bg-[var(--color-accent-subtle)] text-[var(--color-accent)] px-1.5 py-0.5 rounded-full">
              Admin
            </span>
          </div>
        </Link>
      </div>

      {/* Nav groups */}
      <nav
        aria-label="Admin navigation"
        className="flex-1 overflow-y-auto py-4 px-3 space-y-4"
      >
        {NAV.map((group, i) => (
          <div key={i}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)]">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(pathname, href, exact)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5'
                      }`}
                    >
                      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* View site */}
      <div className="px-3 py-4 border-t border-white/10 flex-shrink-0">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          View site
        </Link>
      </div>
    </div>
  )
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isAuthRoute = AUTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/')
  )

  if (isAuthRoute) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-[var(--color-bg-elevated)] border-r border-white/10 z-40">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 h-14 px-4 bg-[var(--color-bg-elevated)] border-b border-white/10">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5 transition-colors"
        >
          <Menu size={20} />
        </button>
        <Logo variant="mark" className="h-6 w-auto" />
        <span className="font-heading text-sm font-bold tracking-tight text-[var(--color-fg-primary)]">
          BASS
        </span>
        <span className="text-[10px] font-semibold tracking-widest uppercase bg-[var(--color-accent-subtle)] text-[var(--color-accent)] px-1.5 py-0.5 rounded-full">
          Admin
        </span>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-[var(--color-bg-elevated)] border-r border-white/10"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              <span className="font-heading text-sm font-bold text-[var(--color-fg-primary)]">
                Navigation
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <SidebarContent
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </aside>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 md:pl-64 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
