import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { SpotlightAdminClient } from './_components/SpotlightAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminSpotlightPage() {
  await requireAdminPage()
  return <SpotlightAdminClient />
}
