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
  excerpt: string | null
  commentary: string | null
  cover_image_url: string | null
  author: string
  published_at: string | null
  source_url: string | null
  source_name: string | null
}

const proseCls =
  'prose prose-invert prose-sm sm:prose-base max-w-none text-[var(--color-fg-primary)] prose-headings:font-heading prose-headings:text-[var(--color-fg-primary)] prose-a:text-[var(--color-accent)] prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-[var(--color-accent)] prose-blockquote:text-[var(--color-fg-secondary)]'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('title, dek, excerpt')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!data) return { title: 'Read | BASS' }
  return {
    title: `${data.title} | BASS`,
    description: (data.dek || data.excerpt) ?? undefined,
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
    .select('id, kind, title, slug, dek, body, excerpt, commentary, cover_image_url, author, published_at, source_url, source_name')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error || !data) notFound()

  const article = data as ArticleRow

  // ── Link article ──────────────────────────────────────────────────────────────
  if (article.kind === 'link') {
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

        {/* Attribution tag */}
        {article.source_name && (
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-3">
            via {article.source_name}
          </p>
        )}

        {/* Title */}
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-[var(--color-fg-primary)] leading-tight mb-5">
          {article.title}
        </h1>

        {/* Byline */}
        <div className="flex items-center gap-2 text-xs text-[var(--color-fg-tertiary)] uppercase tracking-wider mb-8 pb-6 border-b border-[var(--color-border-subtle)]">
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

        {/* Excerpt — attributed pull-quote */}
        {article.excerpt && (
          <blockquote className="mb-8 pl-4 border-l-2 border-[var(--color-accent)] text-[var(--color-fg-secondary)] italic text-base leading-relaxed">
            {article.excerpt}
            {article.source_name && (
              <cite className="block mt-2 text-xs not-italic text-[var(--color-fg-tertiary)] uppercase tracking-wider">
                — {article.source_name}
              </cite>
            )}
          </blockquote>
        )}

        {/* Outbound CTA */}
        {article.source_url && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 mb-10 px-5 py-3 rounded-[var(--radius)] bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Read the full article{article.source_name ? ` at ${article.source_name}` : ''} ↗
          </a>
        )}

        {/* Commentary */}
        {article.commentary && (
          <>
            <h2 className="font-heading font-bold text-lg text-[var(--color-fg-primary)] mb-4">
              BASS take
            </h2>
            <div className={proseCls}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.commentary}</ReactMarkdown>
            </div>
          </>
        )}
      </article>
    )
  }

  // ── Original article ──────────────────────────────────────────────────────────
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
        <div className={proseCls}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body}</ReactMarkdown>
        </div>
      )}
    </article>
  )
}
