export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'

// ── Types ─────────────────────────────────────────────────────────────────────

type ArtistEmbed = {
  name: string
  image_url: string | null
}

type Submission = {
  id: string
  title: string
  artwork_url: string | null
  cover_image_url: string | null
  source_url: string
  created_at: string
  artists: ArtistEmbed | null
}

type EditorialSlot = {
  id: string
  slot_key: string
  display_name: string
  description: string | null
  position: number
}

// ── Image helpers ──────────────────────────────────────────────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getImageSrc(sub: Submission): string | null {
  if (isRenderableImage(sub.artwork_url)) return sub.artwork_url!
  if (isRenderableImage(sub.cover_image_url)) return sub.cover_image_url!
  if (isRenderableImage(sub.artists?.image_url)) return sub.artists!.image_url!
  return null
}

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '♪'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ArtworkSquare({
  submission,
  className,
}: {
  submission: Submission
  className?: string
}) {
  const src = getImageSrc(submission)
  const base = `rounded-[var(--radius-md)] object-cover ${className ?? ''}`

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={submission.title}
        className={`${base} w-full h-full`}
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`${base} w-full h-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[var(--color-fg-tertiary)] font-semibold text-base select-none`}
    >
      {getInitials(submission.title)}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createClient()

  // 1. Live editorial assignments
  const { data: liveItems } = await supabase
    .from('v_editorial_live')
    .select('slot_id, submission_id')

  // 2. Active editorial slots in display order
  const { data: slots } = await supabase
    .from('editorial_slots')
    .select('id, slot_key, display_name, description, position')
    .eq('is_active', true)
    .order('position', { ascending: true })

  // 3. Submissions for live items, with embedded artist
  const liveSubIds = (liveItems ?? []).map((i) => i.submission_id)
  const liveSubMap: Record<string, Submission> = {}

  if (liveSubIds.length > 0) {
    const { data: liveSubs } = await supabase
      .from('submissions')
      .select('id, title, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
      .in('id', liveSubIds)

    for (const sub of liveSubs ?? []) {
      liveSubMap[sub.id] = sub as unknown as Submission
    }
  }

  // 4. Recent approved submissions
  const { data: recentRaw } = await supabase
    .from('submissions')
    .select('id, title, artwork_url, cover_image_url, source_url, created_at, artists(name, image_url)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(12)

  const recent = (recentRaw ?? []) as unknown as Submission[]

  // Build slot_id → submission lookup
  const liveBySlotId: Record<string, Submission> = {}
  for (const item of liveItems ?? []) {
    const sub = liveSubMap[item.submission_id]
    if (sub) liveBySlotId[item.slot_id] = sub
  }

  // Hero slot
  const heroSlot = (slots ?? []).find((s) => s.slot_key === 'homepage_hero')
  const heroSub = heroSlot ? (liveBySlotId[heroSlot.id] ?? null) : null

  // Non-hero editorial sections that have a live item
  const editorialSections: Array<{ slot: EditorialSlot; sub: Submission }> = (
    slots ?? []
  )
    .filter((s) => s.slot_key !== 'homepage_hero')
    .flatMap((slot) => {
      const sub = liveBySlotId[slot.id]
      return sub ? [{ slot, sub }] : []
    })

  const hasContent = heroSub || editorialSections.length > 0 || recent.length > 0

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {!hasContent && (
        <p className="text-[var(--color-fg-tertiary)] text-sm text-center mt-24">
          Coming soon.
        </p>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      {heroSub && (
        <section className="mb-14">
          <a
            href={heroSub.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10"
          >
            {/* Artwork */}
            <div className="sm:w-64 sm:flex-shrink-0 aspect-square rounded-[var(--radius-md)] overflow-hidden">
              <ArtworkSquare submission={heroSub} />
            </div>

            {/* Text */}
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] font-semibold mb-3">
                Featured
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-fg-primary)] leading-tight mb-2 group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-default)]">
                {heroSub.title}
              </h1>
              <p className="text-[var(--color-fg-secondary)] mb-5">
                {heroSub.artists?.name ?? 'Unknown Artist'}
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)] border border-[var(--color-accent)] rounded-[var(--radius)] px-3 py-1.5 group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-fg-primary)] transition-colors duration-[var(--animate-default)]">
                Listen ↗
              </span>
            </div>
          </a>
        </section>
      )}

      {/* ── EDITORIAL SECTIONS ───────────────────────────────────────────── */}
      {editorialSections.length > 0 && (
        <section className="mb-14 space-y-6">
          {editorialSections.map(({ slot, sub }) => (
            <div key={slot.id}>
              <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-2 flex items-center gap-1.5">
                <span className="text-[var(--color-accent)]" aria-hidden>→</span>
                {slot.display_name}
              </h2>
              <a
                href={sub.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 hover:bg-[var(--color-bg-higher)] transition-colors duration-[var(--animate-fast)]"
              >
                <div className="w-14 h-14 flex-shrink-0 rounded-[var(--radius)] overflow-hidden">
                  <ArtworkSquare submission={sub} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                    {sub.title}
                  </p>
                  <p className="text-sm text-[var(--color-fg-secondary)] truncate mt-0.5">
                    {sub.artists?.name ?? 'Unknown Artist'}
                  </p>
                </div>
                <span className="text-[var(--color-fg-tertiary)] flex-shrink-0 text-sm ml-2" aria-hidden>
                  ↗
                </span>
              </a>
            </div>
          ))}
        </section>
      )}

      {/* ── LATEST APPROVED ──────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-4 flex items-center gap-1.5">
            <span className="text-[var(--color-accent)]" aria-hidden>→</span>
            Latest
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {recent.map((sub) => (
              <a
                key={sub.id}
                href={sub.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <div className="aspect-square rounded-[var(--radius-md)] overflow-hidden mb-2">
                  <ArtworkSquare submission={sub} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-fg-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors duration-[var(--animate-fast)]">
                  {sub.title}
                </p>
                <p className="text-xs text-[var(--color-fg-secondary)] truncate mt-0.5">
                  {sub.artists?.name ?? 'Unknown Artist'}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
