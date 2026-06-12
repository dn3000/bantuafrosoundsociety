import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type ArticleRow = {
  id: string
  kind: string
  title: string
  slug: string
  dek: string | null
  body: string | null
  cover_image_url: string | null
  author: string
  published_at: string | null
  source_url: string | null
  source_name: string | null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('title, dek')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!data) return { title: 'Read | BASS' }
  return {
    title: `${data.title} | BASS`,
    description: data.dek ?? undefined,
  }
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('articles')
    .select('id, kind, title, slug, dek, body, cover_image_url, author, published_at, source_url, source_name')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error || !data) notFound()

  const article = data as ArticleRow

  if (article.kind === 'link') {
    // TODO(slice-2): Full link-card detail UI. For now render a minimal placeholder.
    return (
      <div className="px-4 sm:px-6 py-16 max-w-2xl mx-auto text-center">
        <p className="text-[var(--color-fg-tertiary)] text-sm mb-4">
          Link article — full detail view coming in Slice 2.
        </p>
        {article.source_url && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            {article.source_name ?? article.source_url} →
          </a>
        )}
      </div>
    )
  }

  return (
    <article className="px-4 sm:px-6 py-10 max-w-2xl mx-auto">
      {/* Cover image */}
      {article.cover_image_url && (
        <div className="mb-8 rounded-[8px] overflow-hidden aspect-[16/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Title */}
      <h1 className="font-heading font-bold text-3xl sm:text-4xl text-[var(--color-fg-primary)] leading-tight mb-3">
        {article.title}
      </h1>

      {/* Dek */}
      {article.dek && (
        <p className="text-lg text-[var(--color-fg-secondary)] leading-relaxed mb-5">
          {article.dek}
        </p>
      )}

      {/* Byline */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-10 pb-6 border-b border-[var(--color-border-subtle)]">
        <span>{article.author}</span>
        {article.published_at && (
          <>
            <span>·</span>
            <time dateTime={article.published_at}>
              {new Date(article.published_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </>
        )}
      </div>

      {/* Body */}
      {article.body && (
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-[var(--color-fg-primary)] prose-headings:font-heading prose-headings:text-[var(--color-fg-primary)] prose-a:text-[var(--color-accent)] prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-[var(--color-accent)] prose-blockquote:text-[var(--color-fg-secondary)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
        </div>
      )}
    </article>
  )
}
