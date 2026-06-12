'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { slugify } from '@/lib/slugify'

type ArticleStatus = 'draft' | 'published' | 'archived'
type ArticleKind = 'original' | 'link'

type ArticleFormValues = {
  kind: ArticleKind
  title: string
  slug: string
  // original-only
  dek: string
  body: string
  // link-only
  source_url: string
  source_name: string
  excerpt: string
  commentary: string
  // shared
  cover_image_url: string
  tags: string
  author: string
  status: ArticleStatus
}

const DEFAULT_VALUES: ArticleFormValues = {
  kind: 'original',
  title: '',
  slug: '',
  dek: '',
  body: '',
  source_url: '',
  source_name: '',
  excerpt: '',
  commentary: '',
  cover_image_url: '',
  tags: '',
  author: 'BASS',
  status: 'draft',
}

type InitialValues = Partial<ArticleFormValues> & { id?: string }

const inputCls =
  'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
const labelCls =
  'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'
const helperCls = 'mt-1 text-xs text-[var(--color-fg-tertiary)]'

export function ArticleForm({ initial }: { initial?: InitialValues }) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)

  const [values, setValues] = useState<ArticleFormValues>({
    ...DEFAULT_VALUES,
    ...initial,
    tags: Array.isArray(initial?.tags)
      ? (initial.tags as unknown as string[]).join(', ')
      : (initial?.tags ?? ''),
  })
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchNote, setFetchNote] = useState<{ ok: boolean; msg: string } | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [showBodyPreview, setShowBodyPreview] = useState(false)
  const [showCommentaryPreview, setShowCommentaryPreview] = useState(false)
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<{
    children: string
    remarkPlugins?: unknown[]
  }> | null>(null)

  useEffect(() => {
    const needsPreview = showBodyPreview || showCommentaryPreview
    if (needsPreview && !ReactMarkdown) {
      import('react-markdown').then((mod) => {
        setReactMarkdown(
          () => mod.default as React.ComponentType<{ children: string; remarkPlugins?: unknown[] }>,
        )
      })
    }
  }, [showBodyPreview, showCommentaryPreview, ReactMarkdown])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const prevTitleRef = useRef(values.title)
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value
    setValues((prev) => ({
      ...prev,
      title,
      slug: !slugManuallyEdited ? slugify(title) : prev.slug,
    }))
    prevTitleRef.current = title
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManuallyEdited(true)
    setValues((prev) => ({ ...prev, slug: e.target.value }))
  }

  function set(field: keyof ArticleFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }))
    }
  }

  function setKind(kind: ArticleKind) {
    setValues((prev) => ({ ...prev, kind }))
  }

  async function handleFetchMetadata() {
    const url = values.source_url.trim()
    if (!url) {
      setFetchNote({ ok: false, msg: 'Enter a source URL first.' })
      return
    }
    setFetching(true)
    setFetchNote(null)
    try {
      const res = await fetch('/api/admin/articles/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json()) as {
        ok: boolean
        title?: string
        excerpt?: string
        image?: string
        sourceName?: string
        sourceUrl?: string
        error?: string
      }

      if (!data.ok) {
        setFetchNote({
          ok: false,
          msg: "Couldn't auto-fetch — fill the fields manually.",
        })
        return
      }

      setValues((prev) => {
        const next = { ...prev }
        if (data.title && !prev.title) {
          next.title = data.title
          if (!slugManuallyEdited) next.slug = slugify(data.title)
        } else if (data.title) {
          // Title already set by user — don't overwrite, but offer slug if empty
          if (!slugManuallyEdited && !prev.slug) next.slug = slugify(data.title)
        }
        if (data.excerpt) next.excerpt = data.excerpt
        if (data.image) next.cover_image_url = data.image
        if (data.sourceName) next.source_name = data.sourceName
        if (data.sourceUrl) next.source_url = data.sourceUrl
        return next
      })
      setFetchNote({ ok: true, msg: 'Metadata fetched — review and edit before saving.' })
    } catch {
      setFetchNote({ ok: false, msg: "Couldn't auto-fetch — fill the fields manually." })
    } finally {
      setFetching(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (values.kind === 'link' && !values.source_url.trim()) {
      setToast({ kind: 'error', msg: 'Source URL is required for link articles.' })
      return
    }

    setSaving(true)
    try {
      const tags = values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const slug = values.slug.trim() || slugify(values.title.trim())

      const payload: Record<string, unknown> = {
        kind: values.kind,
        title: values.title.trim(),
        slug,
        author: values.author.trim() || 'BASS',
        tags,
        status: values.status,
        cover_image_url: values.cover_image_url.trim() || null,
      }

      if (values.kind === 'original') {
        payload.dek = values.dek.trim() || null
        payload.body = values.body.trim() || null
        payload.source_url = null
        payload.source_name = null
        payload.excerpt = null
        payload.commentary = null
      } else {
        payload.source_url = values.source_url.trim() || null
        payload.source_name = values.source_name.trim() || null
        payload.excerpt = values.excerpt.trim() || null
        payload.commentary = values.commentary.trim() || null
        payload.dek = null
        payload.body = null
      }

      const url = isEdit ? `/api/admin/articles/${initial!.id}` : '/api/admin/articles'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Save failed')
      }

      setToast({ kind: 'success', msg: isEdit ? 'Article saved.' : 'Article created.' })
      setTimeout(() => router.push('/admin/articles'), 1000)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const isLink = values.kind === 'link'

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            {isEdit ? 'Edit article' : 'New article'}
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Kind toggle */}
          <div>
            <p className={labelCls}>Type</p>
            <div className="flex gap-2">
              {(['original', 'link'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-4 py-1.5 rounded-[var(--radius)] text-sm font-medium border transition-colors ${
                    values.kind === k
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-fg-primary)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)]'
                  }`}
                >
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── LINK-ONLY: Source URL + fetch ── */}
          {isLink && (
            <div>
              <label className={labelCls}>Source URL *</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={values.source_url}
                  onChange={set('source_url')}
                  required={isLink}
                  placeholder="https://example.com/article"
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={handleFetchMetadata}
                  disabled={fetching}
                  className="flex-shrink-0 text-sm font-semibold border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-2 text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {fetching ? 'Fetching…' : 'Fetch metadata'}
                </button>
              </div>
              {fetchNote && (
                <p
                  className={`mt-1.5 text-xs ${
                    fetchNote.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
                  }`}
                >
                  {fetchNote.msg}
                </p>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className={labelCls}>Title *</label>
            <input
              type="text"
              value={values.title}
              onChange={handleTitleChange}
              required
              placeholder="Article title"
              className={inputCls}
            />
          </div>

          {/* LINK-ONLY: Source name */}
          {isLink && (
            <div>
              <label className={labelCls}>Source name</label>
              <input
                type="text"
                value={values.source_name}
                onChange={set('source_name')}
                placeholder="The Guardian"
                className={inputCls}
              />
            </div>
          )}

          {/* Slug */}
          <div>
            <label className={labelCls}>Slug</label>
            <input
              type="text"
              value={values.slug}
              onChange={handleSlugChange}
              placeholder="auto-filled-from-title"
              className={inputCls}
            />
            <p className={helperCls}>
              URL: /read/{values.slug || slugify(values.title) || '…'}
            </p>
          </div>

          {/* ORIGINAL-ONLY: Dek */}
          {!isLink && (
            <div>
              <label className={labelCls}>Dek / Standfirst</label>
              <input
                type="text"
                value={values.dek}
                onChange={set('dek')}
                placeholder="One sentence that sells the piece"
                className={inputCls}
              />
            </div>
          )}

          {/* Cover image (shared) */}
          <div>
            <label className={labelCls}>Cover image URL</label>
            <input
              type="url"
              value={values.cover_image_url}
              onChange={set('cover_image_url')}
              placeholder="https://…"
              className={inputCls}
            />
          </div>

          {/* LINK-ONLY: Excerpt */}
          {isLink && (
            <div>
              <label className={labelCls}>Excerpt</label>
              <textarea
                value={values.excerpt}
                onChange={set('excerpt')}
                rows={4}
                placeholder="A short attributed teaser from the source…"
                className={`${inputCls} resize-y`}
              />
              <p className={helperCls}>
                Short attributed teaser only — keep it brief. This is displayed as a pull-quote.
              </p>
            </div>
          )}

          {/* Author + Status (shared) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Author</label>
              <input
                type="text"
                value={values.author}
                onChange={set('author')}
                placeholder="BASS"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={values.status} onChange={set('status')} className={inputCls}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Tags (shared) */}
          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input
              type="text"
              value={values.tags}
              onChange={set('tags')}
              placeholder="afrobeats, south africa, interview"
              className={inputCls}
            />
          </div>

          {/* ORIGINAL-ONLY: Body */}
          {!isLink && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls.replace('mb-1.5', '')}>Body (Markdown)</label>
                <button
                  type="button"
                  onClick={() => setShowBodyPreview((v) => !v)}
                  className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] transition-colors"
                >
                  {showBodyPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
              <textarea
                value={values.body}
                onChange={set('body')}
                rows={18}
                placeholder="Write in Markdown…"
                className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
              />
              {showBodyPreview && values.body && (
                <div className="mt-3 p-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] prose prose-invert prose-sm max-w-none text-[var(--color-fg-primary)]">
                  {ReactMarkdown ? (
                    <ReactMarkdown>{values.body}</ReactMarkdown>
                  ) : (
                    <p className="text-xs text-[var(--color-fg-tertiary)]">Loading preview…</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LINK-ONLY: Commentary */}
          {isLink && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls.replace('mb-1.5', '')}>Commentary (Markdown)</label>
                <button
                  type="button"
                  onClick={() => setShowCommentaryPreview((v) => !v)}
                  className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] transition-colors"
                >
                  {showCommentaryPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
              <textarea
                value={values.commentary}
                onChange={set('commentary')}
                rows={10}
                placeholder="Your original take on why this matters…"
                className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
              />
              <p className={helperCls}>
                Your original take. This is the value-add — what BASS thinks about this link.
              </p>
              {showCommentaryPreview && values.commentary && (
                <div className="mt-3 p-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] prose prose-invert prose-sm max-w-none text-[var(--color-fg-primary)]">
                  {ReactMarkdown ? (
                    <ReactMarkdown>{values.commentary}</ReactMarkdown>
                  ) : (
                    <p className="text-xs text-[var(--color-fg-tertiary)]">Loading preview…</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 rounded-[var(--radius)] px-6 py-2.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save article'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/articles')}
              className="text-sm text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
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
