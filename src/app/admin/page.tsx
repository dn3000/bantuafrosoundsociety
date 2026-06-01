import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/artists"
            className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 hover:bg-[var(--color-bg-higher)] transition-colors block"
          >
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Artists</h2>
            <p className="text-sm text-[var(--color-fg-secondary)]">Manage the BASS scene graph.</p>
          </Link>

          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 opacity-50 cursor-not-allowed">
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">Review Queue</h2>
            <p className="text-sm text-[var(--color-fg-tertiary)]">Coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
