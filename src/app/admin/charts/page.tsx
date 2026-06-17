import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { ChartsAdminClient } from './_components/ChartsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminChartsPage() {
  await requireAdminPage()
  return <ChartsAdminClient chartKey="shazam-za-dance" />
}
