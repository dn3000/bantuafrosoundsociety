import { requireAdminPage } from '@/lib/auth/requireAdmin'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

type TileProps = {
  href: string
  title: string
  description: string
  accent?: string
  badge?: string
  highlight?: boolean
  wide?: boolean
}

// One dashboard tile, mirroring a sidebar nav item. Optional: an accent line
// (a small stat), a header badge (e.g. pending count), a highlight ring, and a
// two-column span (used by the Review queue).
function Tile({ href, title, description, accent, badge, highlight, wide }: TileProps) {
  return (
    <Link
      href={href}
      className={`bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block${
        highlight ? ' ring-1 ring-[var(--color-accent)]' : ''
      }${wide ? ' sm:col-span-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">{title}</h3>
        {badge ? (
          <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-fg-primary)]">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-[var(--color-fg-secondary)]">{description}</p>
      {accent ? (
        <p className="text-xs font-semibold text-[var(--color-accent)] mt-2">{accent}</p>
      ) : null}
    </Link>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold tracking-widest uppercase text-[var(--color-fg-tertiary)] mb-3">
      {children}
    </h2>
  )
}

export default async function AdminDashboardPage() {
  const { supabase, user } = await requireAdminPage()

  // All dashboard counts in a single round-trip.
  const [
    liveRowsRes,
    slotTotalRes,
    pendingSubsRes,
    pendingVidsRes,
    approvedVidsRes,
    publishedArticlesRes,
  ] = await Promise.all([
    supabase.from('v_editorial_live').select('slot_id'),
    supabase.from('editorial_slots').select('id', { count: 'exact', head: true }),
    supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published'),
  ])

  // "Live" = slots with a current assignment; total = seeded slots (fetched so
  // the denominator never goes stale as slots are added).
  const liveCount = liveRowsRes.data?.length ?? 0
  const slotTotal = slotTotalRes.count ?? 0
  const pendingTotal = (pendingSubsRes.count ?? 0) + (pendingVidsRes.count ?? 0)
  const approvedVideos = approvedVidsRes.count ?? 0
  const publishedArticles = publishedArticlesRes.count ?? 0

  const editorialAccent = slotTotal > 0 ? `${liveCount} / ${slotTotal} slots live` : `${liveCount} live`

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

        <div className="space-y-10">
          {/* Inbox — operations, not homepage-mirrored */}
          <section>
            <GroupLabel>Inbox</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile
                href="/admin/queue"
                title="Review queue"
                description="Unified curator's inbox — triage submissions & videos, then promote to slots."
                badge={pendingTotal > 0 ? `${pendingTotal} pending` : undefined}
                highlight
                wide
              />
            </div>
          </section>

          {/* Curation rails — ordered top → bottom to mirror the homepage */}
          <section>
            <GroupLabel>Curation rails</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile href="/admin/hero" title="Hero" description="Pick, order, and publish hero rail items." />
              <Tile href="/admin/playlists" title="Playlists" description="Curate playlists featured on the homepage." />
              <Tile href="/admin/this-week" title="This Week" description="Curate the BASS This Week picks." />
              <Tile
                href="/admin/videos"
                title="Videos"
                description="Curate the homepage video rows."
                accent={`${approvedVideos} approved`}
              />
              <Tile href="/admin/spotlight" title="Spotlight" description="Curate the Artist Spotlight rail." />
              <Tile
                href="/admin/charts"
                title="Charts"
                description="Refresh the Shazam SA Dance chart and publish a curated cut."
              />
              <Tile href="/admin/events" title="Events" description="Schedule live shows and the homepage events row." />
              <Tile
                href="/admin/editorial"
                title="Editorial"
                description="Feature content in homepage slots."
                accent={editorialAccent}
              />
              <Tile
                href="/admin/articles"
                title="Articles"
                description="Write and publish BASS Read articles."
                accent={`${publishedArticles} published`}
              />
            </div>
          </section>

          {/* Content — long-lived entities */}
          <section>
            <GroupLabel>Content</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile href="/admin/artists" title="Artists" description="Manage the BASS scene graph." />
              <Tile
                href="/admin/submissions"
                title="Submissions"
                description="Review queue for tracks, releases, mixes, and events."
              />
            </div>
          </section>

          {/* Ingestion */}
          <section>
            <GroupLabel>Ingestion</GroupLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile
                href="/admin/scrapers"
                title="Scrapers"
                description="Scan Spotify for new releases into the review queue."
              />
              <Tile href="/admin/integrations" title="Integrations" description="Connect Spotify and other services." />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
