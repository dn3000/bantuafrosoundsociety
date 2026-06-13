import { PublicNav } from '@/components/nav/PublicNav'
import { MobileHeader } from '@/components/MobileHeader'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <PublicNav />
      <MobileHeader />
      <div className="md:ml-60 pb-28 md:pb-0">
        {children}
      </div>
    </div>
  )
}
