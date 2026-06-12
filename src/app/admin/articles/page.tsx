'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type ArticleStatus = 'draft' | 'published' | 'archived'
type StatusFilter = ArticleStatus | 'all'
type ArticleKind = 'original' | 'link'

type Article = {
  id: string
  kind: ArticleKind
  title: string
  slug: string
  dek: string | null
  author: string
  status: ArticleStatus
  published_at: string | null
  created_at: string
}

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const STATUS_COLORS: Record<ArticleStatus, string> = {
  draft: 'text-[var(--color-warning)]',
  published: 'text-[var(--color-success)]',
  archived: 'text-[var(--color-fg-tertiary)]',
}

const KIND_LABELS: Record<ArticleKind, string> = {
  original: 'Original',
  link: 'Link',
}

export default function ArticlesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all')
  const [articles, setArticles] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<ArticleStatus, number>>({ draft: 0, published: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const fetchCounts = useCallback(async () => {
    const statuses: ArticleStatus[] = ['draft', 'published', 'archived']
    const results = await Promise.all(
      statuses.map((s) =>
        supabase.from('articles').select('*', { count: 'exact', head: true }).eq('status', s),
      ),
    )
    const next = { draft: 0, published: 0, archived: 0 } as Record<ArticleStatus, number>
    results.forEach(({ count }, i) => { next[statuses[i]] = count ?? 0 })
    setCounts(next)
  }, [supabase])

  const fetchArticles = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('articles')
        .select('id, kind, title, slug, dek, author, status, published_at, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (activeFilter !== 'all') {
        query = query.eq('status', activeFilter)
      }

      const { data, error, count } = await query
      if (error) throw error
      setArticles((data ?? []) as Article[])
      setTotal(count ?? 0)
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to load articles' })
    } finally {
      setLoading(false)
    }
  }, [supabase, activeFilter])

  useEffect(() => { fetchArticles() }, [fetchArticles])
  useEffect(() => { fetchCounts() }, [fetchCounts])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  function handleFilterChange(f: StatusFilter) {
    setActiveFilter(f)
  }

  async function handleDelete(article: Article) {
    if (deleting.has(article.id)) return
    const ok = window.confirm(`Delete "${article.title}"? This cannot be undone.`)
    if (!ok) return
    setDeleting((prev) => new Set(prev).add(article.id))
    try {
      const res = await fetch(`/api/admin/articles/${article.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Delete failed')
      }
      setArticles((prev) => prev.filter((a) => a.id !== article.id))
      setTotal((t) => t - 1)
      setToast({ kind: 'success', msg: `Deleted "${article.title}"` })
      fetchCounts()
    } catch (err) {
      setToast({ kind: 'error', msg: err instanceof Error ? err.message : 'Failed to delete' })
    } finally {
      setDeleting((prev) => { const next = new Set(prev); next.delete(article.id); return next })
    }
  }

  const allCount = counts.draft + counts.published + counts.archived

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-6 sm:p-10 pb-20">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">
              Article manager
            </h1>
            <p className="text-sm text-[var(--color-fg-secondary)] mt-1">
              {total} {activeFilter !== 'all' ? activeFilter : ''} {total === 1 ? 'article' : 'articles'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/articles/new"
              className="text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-fg-primary)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius)] px-4 py-2 transition-colors"
            >
              New article
            </Link>
          </div>
        </header>

        {/* Status filter tabs */}
        <div className="flex gap-0.5 mb-5 border-b border-[var(--color-border-subtle)]">
          {TABS.map((tab) => {
            const count = tab.key === 'all' ? allCount : counts[tab.key]
            const isActive = activeFilter === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleFilterChange(tab.key)}
                className={`px-4 py-2 text-sm rounded-t-[var(--radius)] transition-colors border-b-2 -mb-px ${
                  isActive
                    ? 'border-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold'
                    : 'border-transparent text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)]'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-[var(--color-fg-secondary)]' : 'text-[var(--color-fg-tertiary)]'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-fg-secondary)]">Loading…</p>
        ) : articles.length === 0 ? (
          <div className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] p-10 text-center">
            <p className="text-[var(--color-fg-secondary)] mb-4">
              No {activeFilter !== 'all' ? activeFilter : ''} articles.
            </p>
            <Link
              href="/admin/articles/new"
              className="inline-block text-sm text-[var(--color-accent)] hover:underline"
            >
              Write the first one →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {articles.map((a) => (
              <li key={a.id} className="bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-4 py-3 flex items-center gap-3">
                {/* Kind badge */}
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg-higher)] text-[var(--color-fg-tertiary)] flex-shrink-0">
                  {KIND_LABELS[a.kind]}
                </span>

                {/* Title + slug */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--color-fg-primary)] truncate">{a.title}</p>
                  <p className="text-xs text-[var(--color-fg-tertiary)] truncate">/read/{a.slug}</p>
                </div>

                {/* Status */}
                <span className={`text-xs font-medium flex-shrink-0 ${STATUS_COLORS[a.status]}`}>
                  {a.status}
                </span>

                {/* Published date */}
                <span className="text-xs text-[var(--color-fg-tertiary)] flex-shrink-0 hidden sm:block w-24 text-right">
                  {a.published_at
                    ? new Date(a.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/articles/${a.id}/edit`}
                    className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-border-default)] text-[var(--color-fg-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg-primary)] transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    disabled={deleting.has(a.id)}
                    className="text-xs font-semibold rounded-[var(--radius)] px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-bg-base)] disabled:opacity-40 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
