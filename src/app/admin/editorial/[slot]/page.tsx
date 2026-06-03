'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

type ArtistInfo = {
  id: string
  name: string
  image_url: string | null
}

type SubmissionInfo = {
  id: string
  title: string
  type: string
  artwork_url: string | null
  cover_image_url: string | null
  status: string
  artists: ArtistInfo | null
}

type Assignment = {
  id: string
  slot_id: string
  submission_id: string
  start_at: string
  end_at: string | null
  who_assigned: string | null
  assigned_at: string
  created_at: string
  submissions: SubmissionInfo | null
}

type Slot = {
  id: string
  slot_key: string
  display_name: string
  description: string | null
  position: number
  is_active: boolean
}

type SubmissionOption = {
  id: string
  title: string
  type: string
  artwork_url: string | null
  cover_image_url: string | null
  artists: { name: string; image_url: string | null } | null
}

type AssignmentStatus = 'live' | 'scheduled' | 'past'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRenderableImage(url: string | null | undefined): boolean {
  if (!url) return false
  if (url === 'no_spotify_image') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

function getStatus(a: Assignment, now: Date): AssignmentStatus {
  const start = new Date(a.start_at)
  const end = a.end_at ? new Date(a.end_at) : null
  if (start > now) return 'scheduled'
  if (end !== null && end <= now) return 'past'
  return 'live'
}

function formatWindow(start_at: string, end_at: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  const start = new Date(start_at).toLocaleString(undefined, opts)
  if (!end_at) return `${start} → open-ended`
  return `${start} → ${new Date(end_at).toLocaleString(undefined, opts)}`
}

function toLocalDatetimeInput(utcIso: string): string {
  const d = new Date(utcIso)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-') + 'T' + [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join(':')
}

function nowLocalDatetime(): string {
  return toLocalDatetimeInput(new Date().toISOString())
}

function pickImageSrc(
  artwork_url: string | null | undefined,
  cover_image_url: string | null | undefined,
  artist_image_url: string | null | undefined,
): string | null {
  if (isRenderableImage(artwork_url)) return artwork_url!
  if (isRenderableImage(cover_image_url)) return cover_image_url!
  if (isRenderableImage(artist_image_url)) return artist_image_url!
  return null
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'

function Thumbnail({
  submission,
  size = 'sm',
}: {
  submission: SubmissionInfo | SubmissionOption | null
  size?: 'sm' | 'md'
}) {
  const dim = size === 'md' ? 'w-12 h-12' : 'w-10 h-10'
  const src = pickImageSrc(
    submission?.artwork_url,
    submission?.cover_image_url,
    submission?.artists?.image_url,
  )
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={submission?.title ?? ''}
        className={`${dim} rounded-[var(--radius)] object-cover flex-shrink-0`}
        loading="lazy"
      />
    )
  }
  const initials = submission?.title
    ? submission.title.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : '♪'
  return (
    <div className={`${dim} rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)] flex-shrink-0`}>
      {initials}
    </div>
  )
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const styles: Record<AssignmentStatus, string> = {
    live: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
    scheduled: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-secondary)]',
    past: 'bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)]',
  }
  const label = status === 'scheduled' ? 'Upcoming' : status === 'live' ? 'Live' : 'Past'
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${styles[status]}`}>
      {label}
    </span>
  )
}

function AssignmentRow({
  assignment,
  now,
  onEdit,
  onRemove,
  canEdit,
}: {
  assignment: Assignment
  now: Date
  onEdit: (a: Assignment) => void
  onRemove: (a: Assignment) => void
  canEdit: boolean
}) {
  const status = getStatus(assignment, now)
  const sub = assignment.submissions
  return (
    <div className="flex items-start gap-3 p-3 bg-[var(--color-bg-higher)] rounded-[var(--radius)]">
      <Thumbnail submission={sub} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">
            {sub?.title ?? '—'}
          </span>
          <StatusBadge status={status} />
        </div>
        <p className="text-xs text-[var(--color-fg-secondary)] truncate">
          {sub?.artists?.name ?? 'Unknown artist'}
        </p>
        <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-0.5">
          {formatWindow(assignment.start_at, assignment.end_at)}
        </p>
        <p className="text-[10px] text-[var(--color-fg-tertiary)]">
          Scheduled{' '}
          {new Date(assignment.assigned_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
        {canEdit && (
          <button
            type="button"
            onClick={() => onEdit(assignment)}
            className="text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1 hover:border-[var(--color-border-strong)] transition-colors"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(assignment)}
          className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-error)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-2 py-1 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function SubmissionPicker({
  value,
  onChange,
}: {
  value: SubmissionOption | null
  onChange: (s: SubmissionOption | null) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<SubmissionOption[]>([])
  const [searching, setSearching] = useState(false)

  const fetchResults = useCallback(async () => {
    if (search.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const params = new URLSearchParams({ status: 'approved', search, limit: '20' })
      const res = await fetch(`/api/admin/submissions?${params}`)
      const data = await res.json()
      if (res.ok) {
        setResults(
          (data.submissions ?? []).map((s: {
            id: string
            title: string
            type: string
            artwork_url: string | null
            cover_image_url: string | null
            artists: { name: string; image_url: string | null } | null
          }) => ({
            id: s.id,
            title: s.title,
            type: s.type,
            artwork_url: s.artwork_url,
            cover_image_url: s.cover_image_url,
            artists: s.artists,
          }))
        )
      }
    } finally {
      setSearching(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchResults, 200)
    return () => clearTimeout(t)
  }, [fetchResults])

  if (value) {
    const src = pickImageSrc(value.artwork_url, value.cover_image_url, value.artists?.image_url)
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={value.title} className="w-10 h-10 rounded-[var(--radius)] object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)]">
              {value.title[0]?.toUpperCase() ?? '♪'}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--color-fg-primary)]">{value.title}</p>
            <p className="text-xs text-[var(--color-fg-secondary)]">
              {value.artists?.name ?? 'Unknown artist'} · {value.type}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); setSearch('') }}
          className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors flex-shrink-0"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search approved submissions…"
        className={inputCls}
        autoFocus
      />
      {searching && (
        <p className="text-xs text-[var(--color-fg-tertiary)] mt-1.5">Searching…</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 space-y-0.5 max-h-60 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius)] bg-[var(--color-bg-input)]">
          {results.map((s) => {
            const src = pickImageSrc(s.artwork_url, s.cover_image_url, s.artists?.image_url)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => { onChange(s); setSearch(''); setResults([]) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--color-bg-higher)] transition-colors text-left"
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={s.title} className="w-8 h-8 rounded-[var(--radius)] object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-[var(--radius)] bg-[var(--color-bg-higher)] flex items-center justify-center text-xs font-semibold text-[var(--color-fg-secondary)] flex-shrink-0">
                      {s.title[0]?.toUpperCase() ?? '♪'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-fg-primary)] truncate">{s.title}</p>
                    <p className="text-xs text-[var(--color-fg-secondary)]">
                      {s.artists?.name ?? 'Unknown artist'} · {s.type}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {search.length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs text-[var(--color-fg-tertiary)] mt-1.5">No approved submissions found.</p>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SlotManagePage() {
  const { slot: slotKey } = useParams<{ slot: string }>()

  const [slot, setSlot] = useState<Slot | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Form modal state
  const [showForm, setShowForm] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionOption | null>(null)
  const [startAt, setStartAt] = useState(nowLocalDatetime())
  const [endAt, setEndAt] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Past section
  const [pastExpanded, setPastExpanded] = useState(false)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    if (!slotKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/editorial/slots/${slotKey}`)
      const data = await res.json()
      if (res.ok) {
        setSlot(data.slot)
        setAssignments(data.assignments)
        setFetchError(null)
      } else {
        setFetchError(data.error ?? 'Failed to load slot')
      }
    } catch {
      setFetchError('Network error')
    } finally {
      setLoading(false)
    }
  }, [slotKey])

  useEffect(() => { fetchData() }, [fetchData])

  function openAdd() {
    setEditingAssignment(null)
    setSelectedSubmission(null)
    setStartAt(nowLocalDatetime())
    setEndAt('')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(a: Assignment) {
    setEditingAssignment(a)
    setSelectedSubmission(
      a.submissions
        ? {
            id: a.submissions.id,
            title: a.submissions.title,
            type: a.submissions.type,
            artwork_url: a.submissions.artwork_url,
            cover_image_url: a.submissions.cover_image_url,
            artists: a.submissions.artists,
          }
        : null
    )
    setStartAt(toLocalDatetimeInput(a.start_at))
    setEndAt(a.end_at ? toLocalDatetimeInput(a.end_at) : '')
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingAssignment(null)
    setFormError(null)
  }

  async function handleSave() {
    if (!selectedSubmission) { setFormError('Please select a submission'); return }
    if (!startAt) { setFormError('Start time is required'); return }

    setFormError(null)
    setSaving(true)
    try {
      const startUtc = new Date(startAt).toISOString()
      const endUtc = endAt ? new Date(endAt).toISOString() : null
      const isEdit = editingAssignment !== null

      const url = isEdit
        ? `/api/admin/editorial/assignments/${editingAssignment!.id}`
        : '/api/admin/editorial/assignments'
      const method = isEdit ? 'PATCH' : 'POST'
      const body = isEdit
        ? { submission_id: selectedSubmission.id, start_at: startUtc, end_at: endUtc }
        : { slot_key: slotKey, submission_id: selectedSubmission.id, start_at: startUtc, end_at: endUtc }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.conflict) {
          setFormError(
            `Overlap with existing window: ${formatWindow(data.conflict.start_at, data.conflict.end_at)}`
          )
        } else {
          setFormError(data.error ?? 'Failed to save')
        }
        return
      }

      closeForm()
      showToast(isEdit ? 'Assignment updated' : 'Assignment scheduled')
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(assignment: Assignment) {
    const label = assignment.submissions?.title ?? 'this assignment'
    if (!window.confirm(`Remove "${label}" from this slot?`)) return
    try {
      const res = await fetch(`/api/admin/editorial/assignments/${assignment.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        showToast(`Error: ${data.error ?? 'Failed to remove'}`)
        return
      }
      showToast('Assignment removed')
      await fetchData()
    } catch {
      showToast('Network error')
    }
  }

  // Split assignments into sections using a stable `now` for this render
  const now = new Date()
  const liveAssignments = assignments.filter((a) => getStatus(a, now) === 'live')
  const upcomingAssignments = assignments
    .filter((a) => getStatus(a, now) === 'scheduled')
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
  const pastAssignments = assignments
    .filter((a) => getStatus(a, now) === 'past')
    .sort((a, b) => b.start_at.localeCompare(a.start_at))

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] px-4 py-3 text-sm text-[var(--color-fg-primary)] shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeForm() }}
        >
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-5">
              {editingAssignment ? 'Edit assignment' : 'Schedule an item'}
            </h2>

            <div className="space-y-5">
              <div>
                <p className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-2">
                  Submission *
                </p>
                <SubmissionPicker value={selectedSubmission} onChange={setSelectedSubmission} />
              </div>

              <label className="block">
                <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider block mb-1">
                  Start *
                </span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={inputCls}
                />
              </label>

              <label className="block">
                <span className="text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider block mb-1">
                  End (optional)
                </span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={inputCls}
                />
                <p className="text-[10px] text-[var(--color-fg-tertiary)] mt-1">
                  Leave blank for open-ended.
                </p>
              </label>
            </div>

            {formError && (
              <p className="mt-4 text-sm text-[var(--color-error)]">{formError}</p>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={closeForm}
                className="text-sm text-[var(--color-fg-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 hover:text-[var(--color-fg-primary)] hover:border-[var(--color-border-strong)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-2 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : editingAssignment ? 'Update' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <Link
              href="/admin/editorial"
              className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              ← Back to Editorial
            </Link>
            <button
              type="button"
              onClick={openAdd}
              className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] transition-colors text-sm"
            >
              Schedule an item
            </button>
          </div>
          {slot && (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
                {slot.display_name}
              </h1>
              {slot.description && (
                <p className="text-sm text-[var(--color-fg-secondary)] mt-1">{slot.description}</p>
              )}
            </>
          )}
        </header>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : fetchError ? (
          <p className="text-sm text-[var(--color-error)]">{fetchError}</p>
        ) : (
          <div className="space-y-8">
            {/* LIVE NOW */}
            <section>
              <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
                Live now
              </h2>
              {liveAssignments.length === 0 ? (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 text-sm text-[var(--color-fg-tertiary)] italic">
                  Nothing live
                </div>
              ) : (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 space-y-2">
                  {liveAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      now={now}
                      onEdit={openEdit}
                      onRemove={handleRemove}
                      canEdit
                    />
                  ))}
                </div>
              )}
            </section>

            {/* UPCOMING */}
            <section>
              <h2 className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold mb-3">
                Upcoming
              </h2>
              {upcomingAssignments.length === 0 ? (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 text-sm text-[var(--color-fg-tertiary)] italic">
                  No upcoming assignments
                </div>
              ) : (
                <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 space-y-2">
                  {upcomingAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      now={now}
                      onEdit={openEdit}
                      onRemove={handleRemove}
                      canEdit
                    />
                  ))}
                </div>
              )}
            </section>

            {/* PAST */}
            <section>
              <button
                type="button"
                onClick={() => setPastExpanded((e) => !e)}
                className="w-full flex items-center justify-between text-left mb-3 group"
              >
                <span className="text-xs uppercase tracking-wider text-[var(--color-fg-tertiary)] font-semibold group-hover:text-[var(--color-fg-secondary)] transition-colors">
                  Past ({pastAssignments.length})
                </span>
                <span className="text-xs text-[var(--color-fg-tertiary)] group-hover:text-[var(--color-fg-secondary)] transition-colors">
                  {pastExpanded ? '−' : '+'}
                </span>
              </button>
              {pastExpanded && (
                pastAssignments.length === 0 ? (
                  <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 text-sm text-[var(--color-fg-tertiary)] italic">
                    No past assignments
                  </div>
                ) : (
                  <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-3 space-y-2">
                    {pastAssignments.map((a) => (
                      <AssignmentRow
                        key={a.id}
                        assignment={a}
                        now={now}
                        onEdit={openEdit}
                        onRemove={handleRemove}
                        canEdit={false}
                      />
                    ))}
                  </div>
                )
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
