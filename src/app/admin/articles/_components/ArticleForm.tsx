'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { slugify } from '@/lib/slugify'

type ArticleStatus = 'draft' | 'published' | 'archived'

type ArticleFormValues = {
  id?: string
  title: string
  slug: string
  dek: string
  cover_image_url: string
  tags: string
  author: string
  body: string
  status: ArticleStatus
}

const DEFAULT_VALUES: ArticleFormValues = {
  title: '',
  slug: '',
  dek: '',
  cover_image_url: '',
  tags: '',
  author: 'BASS',
  body: '',
  status: 'draft',
}

export function ArticleForm({ initial }: { initial?: Partial<ArticleFormValues> & { id?: string } }) {
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
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<{ children: string; className?: string }> | null>(null)

  // Lazy-load react-markdown only when preview is needed
  useEffect(() => {
    if (showPreview && !ReactMarkdown) {
      import('react-markdown').then((mod) => {
        setReactMarkdown(() => mod.default as React.ComponentType<{ children: string; className?: string }>)
      })
    }
  }, [showPreview, ReactMarkdown])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Auto-fill slug from title until the user manually edits the slug field
  const prevTitleRef = useRef(values.title)
  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value
    setValues((prev) => {
      const next = { ...prev, title }
      if (!slugManuallyEdited) {
        next.slug = slugify(title)
      }
      return next
    })
    prevTitleRef.current = title
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManuallyEdited(true)
    setValues((prev) => ({ ...prev, slug: e.target.value }))
  }

  function handleChange(field: keyof ArticleFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const tags = values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const payload = {
        kind: 'original',
        title: values.title.trim(),
        slug: values.slug.trim() || slugify(values.title.trim()),
        dek: values.dek.trim() || null,
        cover_image_url: values.cover_image_url.trim() || null,
        tags,
        author: values.author.trim() || 'BASS',
        body: values.body.trim() || null,
        status: values.status,
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

  const inputCls =
    'w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] focus:outline-none transition-colors'
  const labelCls = 'block text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-tertiary)] mb-1.5'

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg-primary)]">
            {isEdit ? 'Edit article' : 'New article'}
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            <p className="mt-1 text-xs text-[var(--color-fg-tertiary)]">
              URL: /read/{values.slug || slugify(values.title) || '…'}
            </p>
          </div>

          {/* Dek */}
          <div>
            <label className={labelCls}>Dek / Standfirst</label>
            <input
              type="text"
              value={values.dek}
              onChange={handleChange('dek')}
              placeholder="One sentence that sells the piece"
              className={inputCls}
            />
          </div>

          {/* Cover image */}
          <div>
            <label className={labelCls}>Cover image URL</label>
            <input
              type="url"
              value={values.cover_image_url}
              onChange={handleChange('cover_image_url')}
              placeholder="https://…"
              className={inputCls}
            />
          </div>

          {/* Author + Status — two columns */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Author</label>
              <input
                type="text"
                value={values.author}
                onChange={handleChange('author')}
                placeholder="BASS"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={values.status} onChange={handleChange('status')} className={inputCls}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input
              type="text"
              value={values.tags}
              onChange={handleChange('tags')}
              placeholder="afrobeats, south africa, interview"
              className={inputCls}
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls.replace('mb-1.5', '')}>Body (Markdown)</label>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] transition-colors"
              >
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>
            </div>
            <textarea
              value={values.body}
              onChange={handleChange('body')}
              rows={18}
              placeholder="Write in Markdown…"
              className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
            />
            {showPreview && values.body && (
              <div className="mt-3 p-4 bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] prose prose-invert prose-sm max-w-none text-[var(--color-fg-primary)]">
                {ReactMarkdown ? (
                  <ReactMarkdown>{values.body}</ReactMarkdown>
                ) : (
                  <p className="text-xs text-[var(--color-fg-tertiary)]">Loading preview…</p>
                )}
              </div>
            )}
          </div>

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
