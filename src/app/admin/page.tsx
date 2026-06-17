import { requireAdminPage } from '@/lib/auth/requireAdmin'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

export default async function AdminDashboardPage() {
  const { supabase, user } = await requireAdminPage()

  // Count slots that currently have a live assignment
  const { data: liveRows } = await supabase.from('v_editorial_live').select('slot_id')
  const liveCount = liveRows?.length ?? 0

  // Pending review backlog (submissions + videos) for the Review queue tile.
  const [pendingSubsRes, pendingVidsRes] = await Promise.all([
    supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const pendingTotal = (pendingSubsRes.count ?? 0) + (pendingVidsRes.count ?? 0)

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo variant="mark" className="h-10 w-auto" priority />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg-primary)]">BASS Admin</h1>
              <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
                Signed in as {user.email}
              </p>
            </div>
          </div>
          <form action="/admin/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Sign out
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/queue"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block ring-1 ring-[var(--color-accent)] sm:col-span-2"
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">Review queue</h2>
              {pendingTotal > 0 && (
                <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-fg-primary)]">
                  {pendingTotal} pending
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--color-fg-secondary)]">
              Unified curator&apos;s inbox — triage submissions &amp; videos, then promote to slots.
            </p>
          </Link>

          <Link
            href="/admin/artists"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Artists</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Manage the BASS scene graph.</p>
          </Link>

          <Link
            href="/admin/submissions"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Submissions</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Review queue for tracks, releases, mixes, and events.</p>
          </Link>

          <Link
            href="/admin/editorial"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Editorial</h2>
            <p className="text-sm text-[var(--color-fg-secondary)] mb-2">Feature content in homepage slots.</p>
            <p className="text-xs font-semibold text-[var(--color-accent)]">{liveCount} / 7 slots live</p>
          </Link>

          <Link
            href="/admin/integrations"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Integrations</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Connect Spotify and other services.</p>
          </Link>

          <Link
            href="/admin/scrapers"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Scrapers</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Scan Spotify for new releases into the review queue.</p>
          </Link>

          <Link
            href="/admin/playlists"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Playlists</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Curate playlists featured on the homepage.</p>
          </Link>

          <Link
            href="/admin/hero"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Hero</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Pick, order, and publish hero rail items.</p>
          </Link>

          <Link
            href="/admin/spotlight"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Spotlight</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Curate the Artist Spotlight rail.</p>
          </Link>

          <Link
            href="/admin/this-week"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">This Week</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Curate the BASS This Week picks.</p>
          </Link>

          <Link
            href="/admin/events"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Events</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Schedule live shows and the homepage events row.</p>
          </Link>

          <Link
            href="/admin/charts"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Charts</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Refresh the Shazam SA Dance chart and publish a curated cut.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
