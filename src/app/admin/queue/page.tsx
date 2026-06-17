import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { QueueClient } from './_components/QueueClient'

export const dynamic = 'force-dynamic'

export default async function AdminQueuePage() {
  await requireAdminPage()
  return <QueueClient />
}
