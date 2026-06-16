import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ThisWeekAdminClient } from './_components/ThisWeekAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminThisWeekPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }
  return <ThisWeekAdminClient />
}
