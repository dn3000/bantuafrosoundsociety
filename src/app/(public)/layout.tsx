import { PublicNav } from '@/components/nav/PublicNav'
import { MobileHeader } from '@/components/MobileHeader'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <PublicNav />
      <MobileHeader />
      {/* pt-14 offsets fixed mobile header (56px); md:pt-0 since desktop has sidebar not top bar */}
      <div className="md:ml-60 pb-20 md:pb-0 pt-14 md:pt-0">
        {children}
      </div>
    </div>
  )
}
