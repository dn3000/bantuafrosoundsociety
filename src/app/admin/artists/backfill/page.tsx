'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Job = {
  id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_count: number
  processed_count: number
  success_count: number
  error_count: number
  last_processed_artist_name: string | null
  last_error: string | null
  started_at: string
  finished_at: string | null
}

type StatusResponse = {
  job: Job | null
  candidatesNeedingBackfill?: number
}

export default function BackfillPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const url = activeJobId
        ? `/api/admin/artists/backfill/status?jobId=${activeJobId}`
        : '/api/admin/artists/backfill/status'
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setStatus(data)
        // If our active job finished, allow starting a new one
        if (data.job?.status === 'completed' || data.job?.status === 'failed') {
          setActiveJobId(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [activeJobId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll every 1.5 seconds while a job is running
  useEffect(() => {
    if (status?.job?.status === 'running') {
      const interval = setInterval(fetchStatus, 1500)
      return () => clearInterval(interval)
    }
  }, [status?.job?.status, fetchStatus])

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/artists/backfill/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start backfill')
      if (data.jobId) {
        setActiveJobId(data.jobId)
      }
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setStarting(false)
    }
  }

  const job = status?.job
  const candidates = status?.candidatesNeedingBackfill ?? 0
  const isRunning = job?.status === 'running'
  const progressPct = job && job.total_count > 0
    ? Math.round((job.processed_count / job.total_count) * 100)
    : 0

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            Backfill artist metadata
          </h1>
          <Link
            href="/admin/artists"
            className="text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] transition-colors"
          >
            Back to artists
          </Link>
        </div>

        <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-2">
            What this does
          </h2>
          <p className="text-sm text-[var(--color-fg-secondary)]">
            Fetches images, Spotify genres, and current follower/popularity stats for all artists
            that have a Spotify ID but no image yet. Runs one artist at a time at a ~150ms cadence.
            Safe to close this tab and come back — progress is saved per artist.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : (
          <>
            {!isRunning && candidates > 0 && (
              <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
                <p className="text-sm text-[var(--color-fg-primary)] mb-4">
                  <strong className="font-semibold">{candidates}</strong>{' '}
                  {candidates === 1 ? 'artist needs' : 'artists need'} backfilling.
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={starting}
                  className="bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-5 py-3 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {starting ? 'Starting…' : 'Start backfill'}
                </button>
                <p className="text-xs text-[var(--color-fg-tertiary)] mt-3">
                  Estimated time: ~{Math.ceil((candidates * 200) / 1000 / 60)} minutes
                </p>
              </div>
            )}

            {!isRunning && candidates === 0 && !job && (
              <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5">
                <p className="text-sm text-[var(--color-fg-secondary)]">
                  No artists need backfilling. All eligible artists already have images.
                </p>
              </div>
            )}

            {job && (
              <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[var(--color-fg-primary)]">
                    {job.status === 'running' && 'Running…'}
                    {job.status === 'completed' && 'Completed'}
                    {job.status === 'failed' && 'Failed'}
                    {job.status === 'pending' && 'Pending'}
                  </h2>
                  <span className="text-xs text-[var(--color-fg-tertiary)] font-mono">
                    {job.processed_count} / {job.total_count} ({progressPct}%)
                  </span>
                </div>

                <div className="w-full h-2 bg-[var(--color-bg-base)] rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[var(--color-fg-tertiary)]">Success</div>
                    <div className="text-[var(--color-fg-primary)] font-semibold font-mono">{job.success_count}</div>
                  </div>
                  <div>
                    <div className="text-[var(--color-fg-tertiary)]">Errors</div>
                    <div className="text-[var(--color-fg-primary)] font-semibold font-mono">{job.error_count}</div>
                  </div>
                  <div>
                    <div className="text-[var(--color-fg-tertiary)]">Status</div>
                    <div className="text-[var(--color-fg-primary)] font-semibold">{job.status}</div>
                  </div>
                </div>

                {job.last_processed_artist_name && job.status === 'running' && (
                  <p className="text-xs text-[var(--color-fg-tertiary)] mt-3">
                    Last: {job.last_processed_artist_name}
                  </p>
                )}

                {job.last_error && (
                  <div className="mt-3 text-xs text-[var(--color-error)]">
                    Last error: {job.last_error}
                  </div>
                )}

                {job.status === 'completed' && candidates > 0 && (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={starting}
                    className="mt-4 bg-[var(--color-accent)] text-[var(--color-fg-primary)] text-sm font-semibold rounded-[var(--radius)] px-4 py-2 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    Run again ({candidates} remaining)
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-[var(--color-error)] mt-4">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
