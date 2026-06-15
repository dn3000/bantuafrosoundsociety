import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HeroAdminClient } from './_components/HeroAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminHeroPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }
  return <HeroAdminClient />
}
