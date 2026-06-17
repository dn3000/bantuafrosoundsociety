'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { EVENT_STATUSES, utcIsoToSastLocal, type EventStatus } from '@/lib/events'

// AdminEvent matches the ADMIN_SELECT shape from api/admin/events/route.ts.
type AdminEvent = {
  id: string
  slug: string
  title: string
  description: string | null
  event_date: string
  end_date: string | null
  venue: string | null
  city: string | null
  country: string | null
  lineup_artist_ids: string[] | null
  lineup_text: string | null
  ticket_url: string | null
  poster_url: string | null
  source_url: string | null
  is_bass_recommended: boolean
  subgenres: string[] | null
  status: EventStatus
  notes: string | null
  created_at: string
  updated_at: string
}

type ArtistOption = {
  id: string
  slug: string
  name: string
  image_url: string | null
}

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const labelCls =
  'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'

const SAST_DISPLAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Johannesburg',
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

function formatSast(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return SAST_DISPLAY.format(d)
}

const STATUS_BADGE: Record<EventStatus, string> = {
  draft:     'bg-white/10 text-[var(--color-fg-secondary)]',
  published: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
  cancelled: 'border border-[var(--color-error)] text-[var(--color-error)]',
  past:      'bg-white/5 text-[var(--color-fg-tertiary)]',
}

export function EventsAdminClient() {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminEvent | null>(null)
  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/events')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load events')
      setEvents(data.items ?? [])
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load' })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleDelete(ev: AdminEvent) {
    if (!window.confirm(`Delete "${ev.title}"? This cannot be undone.`)) return
    setBusyId(ev.id)
    try {
      const res = await fetch(`/api/admin/events/${ev.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Delete failed')
      }
      setEvents((prev) => prev.filter((e) => e.id !== ev.id))
      setToast({ kind: 'success', msg: 'Event deleted' })
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setBusyId(null)
    }
  }

  function handleNew() {
    setEditing(null)
    setMode('new')
  }
  function handleEdit(ev: AdminEvent) {
    setEditing(ev)
    setMode('edit')
  }
  function handleBackToList() {
    setEditing(null)
    setMode('list')
  }
  async function handleSaved(saved: AdminEvent, kind: 'created' | 'updated') {
    setEvents((prev) => {
      if (kind === 'created') return [saved, ...prev]
      return prev.map((e) => (e.id === saved.id ? saved : e))
    })
    setToast({ kind: 'success', msg: kind === 'created' ? 'Event created' : 'Event updated' })
    handleBackToList()
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <Link
              href="/admin"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              ← Back to admin
            </Link>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Events
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </p>
          </div>
          {mode === 'list' && (
            <button
              type="button"
              onClick={handleNew}
              className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-5 py-2 transition-colors"
            >
              New event
            </button>
          )}
        </header>

        {mode === 'list' ? (
          loading ? (
            <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
          ) : events.length === 0 ? (
            <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-8 text-center text-sm text-[var(--color-fg-tertiary)] italic">
              No events yet. Click <span className="font-semibold">New event</span> to add the first one.
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
                          {ev.title}
                        </p>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${STATUS_BADGE[ev.status]}`}
                        >
                          {ev.status}
                        </span>
                        {ev.is_bass_recommended && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 border border-[var(--color-accent)] text-[var(--color-accent)]">
                            BASS pick
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-fg-secondary)] mt-1">
                        {formatSast(ev.event_date)} SAST
                        {ev.city ? ` · ${ev.city}` : ''}
                        {ev.venue ? ` · ${ev.venue}` : ''}
                      </p>
                      <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-1 font-mono truncate">
                        /events/{ev.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(ev)}
                        disabled={busyId === ev.id}
                        className="text-xs font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-1.5 text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] disabled:opacity-40 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ev)}
                        disabled={busyId === ev.id}
                        className="text-xs font-semibold border border-[var(--color-error)] rounded-[var(--radius)] px-3 py-1.5 text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <EventForm
            initial={editing}
            onCancel={handleBackToList}
            onSaved={handleSaved}
          />
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-4 z-50 max-w-sm rounded-[var(--radius)] px-4 py-3 text-sm shadow-lg border ${
            toast.kind === 'success'
              ? 'bg-[var(--color-bg-elevated)] border-[var(--color-success)] text-[var(--color-fg-primary)]'
              : 'bg-[var(--color-bg-elevated)] border-[var(--color-error)] text-[var(--color-fg-primary)]'
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Form ─────────────────────────────────────────────────────────────────────

type FormState = {
  title: string
  slug: string
  description: string
  event_date: string
  end_date: string
  venue: string
  city: string
  country: string
  lineup_text: string
  ticket_url: string
  poster_url: string
  source_url: string
  notes: string
  subgenresInput: string
  status: EventStatus
  is_bass_recommended: boolean
  lineup_artist_ids: string[]
}

function emptyForm(): FormState {
  return {
    title: '',
    slug: '',
    description: '',
    event_date: '',
    end_date: '',
    venue: '',
    city: '',
    country: 'South Africa',
    lineup_text: '',
    ticket_url: '',
    poster_url: '',
    source_url: '',
    notes: '',
    subgenresInput: '',
    status: 'draft',
    is_bass_recommended: false,
    lineup_artist_ids: [],
  }
}

function formFromEvent(ev: AdminEvent): FormState {
  return {
    title: ev.title,
    slug: ev.slug,
    description: ev.description ?? '',
    event_date: utcIsoToSastLocal(ev.event_date),
    end_date: utcIsoToSastLocal(ev.end_date),
    venue: ev.venue ?? '',
    city: ev.city ?? '',
    country: ev.country ?? '',
    lineup_text: ev.lineup_text ?? '',
    ticket_url: ev.ticket_url ?? '',
    poster_url: ev.poster_url ?? '',
    source_url: ev.source_url ?? '',
    notes: ev.notes ?? '',
    subgenresInput: (ev.subgenres ?? []).join(', '),
    status: ev.status,
    is_bass_recommended: ev.is_bass_recommended,
    lineup_artist_ids: ev.lineup_artist_ids ?? [],
  }
}

// Payload returned by /api/admin/events/resolve. Mirrors the route's Resolved
// type — every field nullable so a partial extraction is still useful.
type ResolverPayload = {
  title: string | null
  description: string | null
  poster_url: string | null
  venue: string | null
  city: string | null
  country: string | null
  event_date: string | null
  end_date: string | null
  ticket_url: string | null
  source_url: string
  lineup_text: string | null
  dateNeedsReview: boolean
  resolved: boolean
  message?: string
}

function EventForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: AdminEvent | null
  onCancel: () => void
  onSaved: (saved: AdminEvent, kind: 'created' | 'updated') => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    initial ? formFromEvent(initial) : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when a Paste-a-link resolve returned no usable date (or an explicit
  // dateNeedsReview flag). Cleared the moment the admin types into the start
  // field — by then it's no longer "needs review", it's been entered.
  const [dateNeedsReview, setDateNeedsReview] = useState(false)

  // Lineup chips: hydrate the artist details for ids already on the event so
  // the chips render with names and not opaque UUIDs.
  const [lineup, setLineup] = useState<ArtistOption[]>([])
  const initialIdsRef = useRef<string[]>(initial?.lineup_artist_ids ?? [])

  useEffect(() => {
    const ids = initialIdsRef.current
    if (ids.length === 0) {
      setLineup([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/events/artists?ids=${ids.join(',')}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? 'Failed to load lineup')
        // Preserve original ordering rather than the API's natural sort.
        const byId = new Map<string, ArtistOption>(
          (data.artists ?? []).map((a: ArtistOption) => [a.id, a]),
        )
        const ordered = ids
          .map((id) => byId.get(id))
          .filter((a): a is ArtistOption => !!a)
        setLineup(ordered)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load lineup')
      }
    })()
    return () => { cancelled = true }
  }, [])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === 'event_date' && dateNeedsReview) setDateNeedsReview(false)
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Drop resolver results into the form state. Each field overwrites only
  // when the resolver returned a non-null value, so a partial extraction
  // doesn't wipe fields the admin already filled. Title/poster/etc. are
  // direct mappings; dateNeedsReview becomes the inline notice flag.
  function applyResolverPayload(p: ResolverPayload) {
    setForm((f) => ({
      ...f,
      title: p.title ?? f.title,
      description: p.description ?? f.description,
      poster_url: p.poster_url ?? f.poster_url,
      venue: p.venue ?? f.venue,
      city: p.city ?? f.city,
      country: p.country ?? f.country,
      // Only stamp the date when the resolver was confident enough to return
      // one (i.e. it carried an explicit timezone). Otherwise leave whatever
      // the admin already typed.
      event_date: p.event_date ?? f.event_date,
      end_date: p.end_date ?? f.end_date,
      ticket_url: p.ticket_url ?? f.ticket_url,
      source_url: p.source_url ?? f.source_url,
      lineup_text: p.lineup_text ?? f.lineup_text,
    }))
    setDateNeedsReview(p.dateNeedsReview || !p.event_date)
  }

  function addArtist(a: ArtistOption) {
    if (form.lineup_artist_ids.includes(a.id)) return
    setLineup((prev) => [...prev, a])
    setForm((f) => ({ ...f, lineup_artist_ids: [...f.lineup_artist_ids, a.id] }))
  }
  function removeArtist(id: string) {
    setLineup((prev) => prev.filter((a) => a.id !== id))
    setForm((f) => ({
      ...f,
      lineup_artist_ids: f.lineup_artist_ids.filter((x) => x !== id),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim()) {
      setError('Title is required')
      return
    }
    if (!form.event_date.trim()) {
      setError('Event date is required')
      return
    }

    const subgenres = form.subgenresInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.event_date,
      end_date: form.end_date.trim() || null,
      venue: form.venue.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      lineup_artist_ids: form.lineup_artist_ids,
      lineup_text: form.lineup_text.trim() || null,
      ticket_url: form.ticket_url.trim() || null,
      poster_url: form.poster_url.trim() || null,
      source_url: form.source_url.trim() || null,
      subgenres,
      status: form.status,
      is_bass_recommended: form.is_bass_recommended,
      notes: form.notes.trim() || null,
    }
    // Slug only sent when the admin actually typed one — empty means
    // "auto-derive from title" on create or "leave existing" on edit.
    if (form.slug.trim()) payload.slug = form.slug.trim()

    setSaving(true)
    try {
      const url = initial ? `/api/admin/events/${initial.id}` : '/api/admin/events'
      const method = initial ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data.item as AdminEvent, initial ? 'updated' : 'created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 space-y-6"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">
          {initial ? 'Edit event' : 'New event'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
        >
          Cancel
        </button>
      </div>

      {!initial && (
        <LinkResolverPanel onResolved={applyResolverPayload} />
      )}

      {dateNeedsReview && (
        <div className="rounded-[var(--radius)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-3 py-2 text-xs text-[var(--color-fg-primary)]">
          Couldn&apos;t detect the date automatically — please set the start time below.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Title *</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => patch('title', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Slug{' '}
            <span className="text-[var(--color-fg-tertiary)] normal-case tracking-normal font-normal">
              (auto-generated from title when blank)
            </span>
          </label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => patch('slug', e.target.value)}
            placeholder={initial?.slug ?? 'auto'}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Start (SAST) *</label>
          <input
            type="datetime-local"
            required
            value={form.event_date}
            onChange={(e) => patch('event_date', e.target.value)}
            className={`${inputCls} ${dateNeedsReview ? 'border-[var(--color-accent)]' : ''}`}
          />
        </div>
        <div>
          <label className={labelCls}>End (SAST)</label>
          <input
            type="datetime-local"
            value={form.end_date}
            onChange={(e) => patch('end_date', e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Venue</label>
          <input
            type="text"
            value={form.venue}
            onChange={(e) => patch('venue', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => patch('city', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input
            type="text"
            value={form.country}
            onChange={(e) => patch('country', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={form.status}
            onChange={(e) => patch('status', e.target.value as EventStatus)}
            className={inputCls}
          >
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => patch('description', e.target.value)}
            rows={4}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Ticket URL</label>
          <input
            type="url"
            value={form.ticket_url}
            onChange={(e) => patch('ticket_url', e.target.value)}
            placeholder="https://"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Poster URL</label>
          <input
            type="url"
            value={form.poster_url}
            onChange={(e) => patch('poster_url', e.target.value)}
            placeholder="https://"
            className={inputCls}
          />
          <PosterPreview src={form.poster_url} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Source URL{' '}
            <span className="text-[var(--color-fg-tertiary)] normal-case tracking-normal font-normal">
              (admin-only — where this event was found, e.g. promoter IG)
            </span>
          </label>
          <input
            type="url"
            value={form.source_url}
            onChange={(e) => patch('source_url', e.target.value)}
            placeholder="https://"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Subgenres{' '}
            <span className="text-[var(--color-fg-tertiary)] normal-case tracking-normal font-normal">
              (comma-separated)
            </span>
          </label>
          <input
            type="text"
            value={form.subgenresInput}
            onChange={(e) => patch('subgenresInput', e.target.value)}
            placeholder="amapiano, gqom"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <LineupPicker
            current={lineup}
            onAdd={addArtist}
            onRemove={(id) => removeArtist(id)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Lineup (free text){' '}
            <span className="text-[var(--color-fg-tertiary)] normal-case tracking-normal font-normal">
              for non-roster acts
            </span>
          </label>
          <input
            type="text"
            value={form.lineup_text}
            onChange={(e) => patch('lineup_text', e.target.value)}
            placeholder="Plus support TBA"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Notes{' '}
            <span className="text-[var(--color-fg-tertiary)] normal-case tracking-normal font-normal">
              (admin-only)
            </span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => patch('notes', e.target.value)}
            rows={3}
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-fg-primary)]">
            <input
              type="checkbox"
              checked={form.is_bass_recommended}
              onChange={(e) => patch('is_bass_recommended', e.target.checked)}
            />
            BASS recommended
          </label>
        </div>
      </div>

      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm font-semibold rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-5 py-2 transition-colors"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create event'}
        </button>
      </div>
    </form>
  )
}

// ── Lineup picker ────────────────────────────────────────────────────────────

function LineupPicker({
  current,
  onAdd,
  onRemove,
}: {
  current: ArtistOption[]
  onAdd: (a: ArtistOption) => void
  onRemove: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ArtistOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const currentIds = useMemo(() => new Set(current.map((a) => a.id)), [current])

  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        const q = query.trim()
        if (q) params.set('q', q)
        const res = await fetch(`/api/admin/events/artists?${params}`, { signal: ctrl.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to search')
        setOptions(data.artists ?? [])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setOptions([])
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [query, open])

  return (
    <div>
      <label className={labelCls}>Lineup (roster artists)</label>
      {current.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {current.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 bg-[var(--color-bg-higher)] rounded-full pl-2.5 pr-1 py-1 text-xs text-[var(--color-fg-primary)]"
            >
              {a.name}
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`Remove ${a.name}`}
                className="w-5 h-5 rounded-full text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] hover:bg-white/10 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-1.5 text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-higher)] transition-colors"
      >
        {open ? 'Hide search' : current.length > 0 ? 'Add another artist' : 'Add artist'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className={inputCls}
            autoFocus
          />
          {loading ? (
            <p className="text-xs text-[var(--color-fg-tertiary)]">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-[var(--color-fg-tertiary)] italic">No artists match.</p>
          ) : (
            <ul className="space-y-0.5 max-h-60 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius)] bg-[var(--color-bg-input)]">
              {options.map((a) => {
                const already = currentIds.has(a.id)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => onAdd(a)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-bg-higher)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArtistThumb src={a.image_url} alt={a.name} />
                      <span className="text-sm text-[var(--color-fg-primary)] flex-1 truncate">
                        {a.name}
                      </span>
                      {already && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-tertiary)]">
                          Added
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ArtistThumb({ src, alt }: { src: string | null; alt: string }) {
  if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        loading="lazy"
      />
    )
  }
  const initials = alt
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--color-bg-higher)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-fg-secondary)] flex-shrink-0">
      {initials || '♪'}
    </div>
  )
}

// ── Poster preview ───────────────────────────────────────────────────────────

function PosterPreview({ src }: { src: string }) {
  const trimmed = src.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null
  return (
    <div className="mt-2 rounded-[var(--radius)] overflow-hidden border border-[var(--color-border-subtle)] bg-[var(--color-bg-higher)] inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmed}
        alt="Poster preview"
        className="h-32 w-auto object-contain block"
        loading="lazy"
        // If the URL is bad, hide the preview rather than show a broken image icon.
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

// ── Link resolver panel ──────────────────────────────────────────────────────

// Sits above the new-event form. Admin pastes a ticketing URL (Howler,
// Quicket, anything with OG/JSON-LD), the server-side resolver fetches it and
// returns extracted fields, and we hand the payload up to the parent form
// to prefill via applyResolverPayload(). The admin then reviews/edits and
// saves through the existing explicit save path. No auto-create.
function LinkResolverPanel({ onResolved }: { onResolved: (p: ResolverPayload) => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  async function handleFetch() {
    const trimmed = url.trim()
    if (!trimmed) {
      setMessage({ kind: 'error', text: 'Paste a URL first' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/events/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = (await res.json()) as ResolverPayload | { error?: string }
      if (!res.ok) {
        const err = (data as { error?: string }).error ?? 'Lookup failed'
        throw new Error(err)
      }
      const payload = data as ResolverPayload
      onResolved(payload)
      if (!payload.resolved) {
        setMessage({
          kind: 'info',
          text: payload.message ?? 'No usable metadata on that page — fill the fields by hand.',
        })
      } else {
        setMessage({ kind: 'success', text: 'Prefilled — review the fields below before saving.' })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Lookup failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-higher)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-[var(--color-fg-primary)]">
          Paste a link to auto-fill
        </span>
        <span className="text-xs text-[var(--color-fg-tertiary)]">
          {open ? 'Hide' : 'Howler, Quicket, or any event page'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border-subtle)] pt-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://howler.co.za/events/… or https://www.quicket.co.za/events/…"
              className={inputCls}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!busy) handleFetch()
                }
              }}
            />
            <button
              type="button"
              onClick={handleFetch}
              disabled={busy || !url.trim()}
              className="text-sm font-semibold border border-[var(--color-border-default)] text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-40 rounded-[var(--radius)] px-4 transition-colors whitespace-nowrap"
            >
              {busy ? 'Fetching…' : 'Fetch details'}
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-fg-tertiary)]">
            Pulls the title, flyer, venue, lineup, and (when the source carries
            a timezone) the start time. Review every field before saving — the
            event is created as a draft.
          </p>
          {message && (
            <p
              className={`text-xs ${
                message.kind === 'success' ? 'text-[var(--color-accent)]' :
                message.kind === 'error'   ? 'text-[var(--color-error)]'  :
                                              'text-[var(--color-fg-secondary)]'
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
