import { requireAdminPage } from '@/lib/auth/requireAdmin'
import { EventsAdminClient } from './_components/EventsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  await requireAdminPage()
  return <EventsAdminClient />
}
