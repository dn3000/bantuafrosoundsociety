import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EventsAdminClient } from './_components/EventsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }
  return <EventsAdminClient />
}
