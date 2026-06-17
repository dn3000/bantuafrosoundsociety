import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { ThisWeekAdminClient } from './_components/ThisWeekAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminThisWeekPage() {
  await requireAdminPage()
  return <ThisWeekAdminClient />
}
