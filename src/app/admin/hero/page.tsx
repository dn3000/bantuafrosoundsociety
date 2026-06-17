import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { HeroAdminClient } from './_components/HeroAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminHeroPage() {
  await requireAdminPage()
  return <HeroAdminClient />
}
