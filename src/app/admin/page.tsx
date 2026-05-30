import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1">BASS Admin</h1>
          <p className="text-neutral-400 text-sm">Signed in as {user.email}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/tracks/new"
            className="border border-neutral-800 rounded-md p-6 hover:border-neutral-600 hover:bg-neutral-900 transition group"
          >
            <h2 className="text-lg font-semibold mb-1 group-hover:text-white">Add Track</h2>
            <p className="text-sm text-neutral-400">Create a new track entry with metadata, links, and preview.</p>
          </Link>
        </div>

        <form action="/admin/auth/signout" method="post" className="mt-10">
          <button
            type="submit"
            className="text-sm text-neutral-400 hover:text-white underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
