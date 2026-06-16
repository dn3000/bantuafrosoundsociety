import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SpotlightAdminClient } from './_components/SpotlightAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminSpotlightPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }
  return <SpotlightAdminClient />
}
