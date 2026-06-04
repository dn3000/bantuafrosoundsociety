import { PublicNav } from '@/components/nav/PublicNav'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <PublicNav />
      {/* Offset sidebar on desktop; add bottom padding on mobile for tab bar */}
      <div className="md:ml-60 pb-20 md:pb-0">
        {children}
      </div>
    </div>
  )
}
