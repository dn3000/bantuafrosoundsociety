export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Read | BASS',
  description: 'Original articles, commentary, and curated links from the BASS editorial team.',
}

type ArticleRow = {
  id: string
  kind: string
  title: string
  slug: string
  dek: string | null
  cover_image_url: string | null
  author: string
  published_at: string | null
}

function ArticleCard({ article }: { article: ArticleRow }) {
  return (
    <Link
      href={`/read/${article.slug}`}
      className="group flex flex-col bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] overflow-hidden hover:bg-[var(--color-bg-higher)] transition-colors"
    >
      {/* Cover image */}
      <div className="aspect-[16/9] w-full bg-[var(--color-bg-higher)] overflow-hidden flex-shrink-0">
        {article.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-full object-cover rounded-[8px] group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full rounded-[8px] bg-[var(--color-bg-higher)] flex items-center justify-center">
            <span className="text-[var(--color-fg-tertiary)] text-xs uppercase tracking-widest">BASS</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h2 className="font-heading font-bold text-base text-[var(--color-fg-primary)] leading-snug mb-1.5 group-hover:text-[var(--color-accent)] transition-colors">
          {article.title}
        </h2>
        {article.dek && (
          <p className="text-xs text-[var(--color-fg-secondary)] leading-relaxed mb-3 line-clamp-2">
            {article.dek}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1.5 text-[10px] text-[var(--color-fg-tertiary)] uppercase tracking-wider">
          <span>{article.author}</span>
          {article.published_at && (
            <>
              <span>·</span>
              <span>
                {new Date(article.published_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

export default async function ReadPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('articles')
    .select('id, kind, title, slug, dek, cover_image_url, author, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(48)

  const articles = (error ? [] : (data ?? [])) as ArticleRow[]

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <header className="mb-10">
        {/* "→ READ" section header style */}
        <h1 className="text-[10px] uppercase tracking-widest text-[var(--color-fg-tertiary)] font-semibold mb-6 flex items-center gap-1.5">
          <span className="text-[var(--color-accent)]" aria-hidden>→</span>
          Read
        </h1>
      </header>

      {articles.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[var(--color-fg-tertiary)] text-sm mb-4">No articles published yet.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-[var(--color-fg-tertiary)] hover:text-[var(--color-accent)] transition-colors"
          >
            <span className="text-[var(--color-accent)]" aria-hidden>←</span>
            Back to home
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  )
}
