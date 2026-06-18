'use client'

import { useEffect, useRef, useState } from 'react'

export type ArtistLite = { id: string; slug: string; name: string; image_url?: string | null }

// Roster search box reusing the events lineup endpoint
// (GET /api/admin/events/artists?q=…). Debounced; calls onChange with the
// selected artist or null to clear.
export function ArtistPicker({
  value,
  onChange,
}: {
  value: ArtistLite | null
  onChange: (a: ArtistLite | null) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ArtistLite[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/events/artists?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults((data.artists ?? []) as ArtistLite[])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, open])

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold rounded-full px-3 py-1 border border-[var(--color-accent)] text-[var(--color-accent)]">
          {value.name}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={q}
        placeholder="Search roster…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2.5 py-1.5 text-sm text-[var(--color-fg-primary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-[var(--color-fg-tertiary)]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-fg-tertiary)]">No matches.</p>
          ) : (
            <ul>
              {results.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(a)
                      setOpen(false)
                      setQ('')
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--color-fg-secondary)] hover:bg-white/5 hover:text-[var(--color-fg-primary)] transition-colors"
                  >
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
