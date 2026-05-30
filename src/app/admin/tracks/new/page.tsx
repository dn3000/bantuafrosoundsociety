'use client'

import { useState } from 'react'
import Link from 'next/link'

type FormState = {
  title: string
  description: string
  bpm: string
  key: string
  energy: string
  subgenres: string
  mood_tags: string
  vocal_type: string
  release_date: string
  artwork_url: string
  preview_url: string
  platform_spotify: string
  platform_apple_music: string
  platform_youtube_music: string
  platform_soundcloud: string
  platform_bandcamp: string
  platform_beatport: string
  notes: string
  is_published: boolean
}

const EMPTY: FormState = {
  title: '',
  description: '',
  bpm: '',
  key: '',
  energy: '',
  subgenres: '',
  mood_tags: '',
  vocal_type: '',
  release_date: '',
  artwork_url: '',
  preview_url: '',
  platform_spotify: '',
  platform_apple_music: '',
  platform_youtube_music: '',
  platform_soundcloud: '',
  platform_bandcamp: '',
  platform_beatport: '',
  notes: '',
  is_published: false,
}

export default function NewTrackPage() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function parseCommaList(input: string): string[] {
    return input.split(',').map((s) => s.trim()).filter(Boolean)
  }

  function buildPlatformLinks(): Record<string, string> {
    const out: Record<string, string> = {}
    if (form.platform_spotify.trim()) out.spotify = form.platform_spotify.trim()
    if (form.platform_apple_music.trim()) out.apple_music = form.platform_apple_music.trim()
    if (form.platform_youtube_music.trim()) out.youtube_music = form.platform_youtube_music.trim()
    if (form.platform_soundcloud.trim()) out.soundcloud = form.platform_soundcloud.trim()
    if (form.platform_bandcamp.trim()) out.bandcamp = form.platform_bandcamp.trim()
    if (form.platform_beatport.trim()) out.beatport = form.platform_beatport.trim()
    return out
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const payload = {
      title: form.title,
      description: form.description || undefined,
      bpm: form.bpm ? Number(form.bpm) : undefined,
      key: form.key || undefined,
      energy: form.energy ? Number(form.energy) : undefined,
      subgenres: parseCommaList(form.subgenres),
      mood_tags: parseCommaList(form.mood_tags),
      vocal_type: form.vocal_type || undefined,
      release_date: form.release_date || undefined,
      artwork_url: form.artwork_url || undefined,
      preview_url: form.preview_url || undefined,
      platform_links: buildPlatformLinks(),
      notes: form.notes || undefined,
      is_published: form.is_published,
    }

    try {
      const res = await fetch('/api/admin/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save track')
      }
      setMessage({ kind: 'success', text: `Saved "${data.track.title}".` })
      setForm(EMPTY)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessage({ kind: 'error', text: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">Add Track</h1>
          <Link href="/admin" className="text-sm text-neutral-400 hover:text-white underline">
            Back to dashboard
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Field label="Title *">
            <input
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="BPM">
              <input
                type="number"
                inputMode="numeric"
                value={form.bpm}
                onChange={(e) => update('bpm', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Key">
              <input
                placeholder="e.g. Am, F#min"
                value={form.key}
                onChange={(e) => update('key', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Energy (1-10)">
              <input
                type="number"
                min={1}
                max={10}
                value={form.energy}
                onChange={(e) => update('energy', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Vocal Type">
              <input
                placeholder="instrumental / vocal / chops"
                value={form.vocal_type}
                onChange={(e) => update('vocal_type', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Subgenres (comma-separated)">
            <input
              placeholder="amapiano, 3-step, afro house"
              value={form.subgenres}
              onChange={(e) => update('subgenres', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Mood tags (comma-separated)">
            <input
              placeholder="hypnotic, sunset, peak time"
              value={form.mood_tags}
              onChange={(e) => update('mood_tags', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Release date">
            <input
              type="date"
              value={form.release_date}
              onChange={(e) => update('release_date', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Artwork URL">
            <input
              type="url"
              value={form.artwork_url}
              onChange={(e) => update('artwork_url', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="30-sec preview URL (mp3)">
            <input
              type="url"
              value={form.preview_url}
              onChange={(e) => update('preview_url', e.target.value)}
              className={inputClass}
            />
          </Field>

          <fieldset className="space-y-3 border border-neutral-800 rounded-md p-4">
            <legend className="text-sm text-neutral-400 px-2">Platform links</legend>
            <PlatformInput label="Spotify" value={form.platform_spotify} onChange={(v) => update('platform_spotify', v)} />
            <PlatformInput label="Apple Music" value={form.platform_apple_music} onChange={(v) => update('platform_apple_music', v)} />
            <PlatformInput label="YouTube Music" value={form.platform_youtube_music} onChange={(v) => update('platform_youtube_music', v)} />
            <PlatformInput label="SoundCloud" value={form.platform_soundcloud} onChange={(v) => update('platform_soundcloud', v)} />
            <PlatformInput label="Bandcamp" value={form.platform_bandcamp} onChange={(v) => update('platform_bandcamp', v)} />
            <PlatformInput label="Beatport" value={form.platform_beatport} onChange={(v) => update('platform_beatport', v)} />
          </fieldset>

          <Field label="Internal notes (admin only)">
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className={inputClass}
            />
          </Field>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => update('is_published', e.target.checked)}
              className="h-4 w-4"
            />
            Publish immediately (visible on public site)
          </label>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting || !form.title}
              className="bg-white text-black font-semibold rounded-md px-5 py-3 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Saving...' : 'Save track'}
            </button>
            <button
              type="button"
              onClick={() => setForm(EMPTY)}
              className="text-sm text-neutral-400 hover:text-white"
            >
              Reset
            </button>
          </div>

          {message && (
            <p className={`text-sm ${message.kind === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {message.text}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function PlatformInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-400 mb-1">{label}</span>
      <input
        type="url"
        placeholder="https://..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  )
}
