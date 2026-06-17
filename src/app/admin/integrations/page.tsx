import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { getSpotifyIntegrationMeta } from '@/lib/integrations'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  await requireAdminPage()

  const params = await searchParams
  const meta = await getSpotifyIntegrationMeta()

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Integrations
          </h1>
          <Link
            href="/admin"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to dashboard
          </Link>
        </div>

        {params.connected === 'spotify' && (
          <div className="mb-6 bg-[var(--color-bg-elevated)] border border-[var(--color-success)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--color-fg-primary)]">
            Spotify connected successfully.
          </div>
        )}
        {params.error && (
          <div className="mb-6 bg-[var(--color-bg-elevated)] border border-[var(--color-error)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--color-error)]">
            Error: {params.error}
          </div>
        )}

        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">Spotify</h2>
              <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
                Required for bulk import from playlists. Unlocks read access to playlist tracks,
                which Client Credentials auth cannot reach.
              </p>
              {meta?.connected && (
                <div className="mt-3 text-xs text-[var(--color-fg-secondary)]">
                  Connected as{' '}
                  <span className="text-[var(--color-fg-primary)] font-semibold">
                    {meta.providerDisplayName || meta.providerUserId}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {meta?.connected ? (
                <form action="/api/auth/spotify/disconnect" method="post">
                  <button
                    type="submit"
                    className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
                  >
                    Disconnect
                  </button>
                </form>
              ) : (
                <Link
                  href="/api/auth/spotify/start"
                  className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] text-sm font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Connect Spotify
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
