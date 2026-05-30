import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">BASS Admin</h1>
        <p className="text-neutral-400 mb-8">Signed in as {user.email}</p>

        <div className="border border-neutral-800 rounded-md p-6">
          <h2 className="text-xl font-semibold mb-2">Welcome to the BASS dashboard</h2>
          <p className="text-neutral-400">
            The admin tools will live here. For now, this is just a placeholder confirming auth works.
          </p>
        </div>

        <form action="/admin/auth/signout" method="post" className="mt-8">
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
