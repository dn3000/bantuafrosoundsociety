import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChartsAdminClient } from './_components/ChartsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminChartsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }
  return <ChartsAdminClient chartKey="shazam-za-dance" />
}
