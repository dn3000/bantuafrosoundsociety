// Shared "Title ›" section header used across homepage sections.
//
// Single source of truth for the heading style: heading font, semibold weight,
// 15px, off-white text, with an accent-colored ChevronRight glyph.

import { ChevronRight } from 'lucide-react'

export function SectionTitle({
  title,
  className,
}: {
  title: string
  /** Optional extra utility classes (e.g. spacing overrides). */
  className?: string
}) {
  return (
    <h2
      className={`font-bold flex items-center gap-1 ${className ?? 'mb-4'}`}
      style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9375rem', color: 'var(--color-fg-primary)' }}
    >
      {title}
      <ChevronRight size={14} className="text-[var(--color-accent)]" aria-hidden="true" />
    </h2>
  )
}
