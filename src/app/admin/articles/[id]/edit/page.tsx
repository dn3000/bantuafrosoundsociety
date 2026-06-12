import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ArticleForm } from '../../_components/ArticleForm'

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('articles')
    .select('id, kind, title, slug, dek, cover_image_url, tags, author, body, status')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  return (
    <ArticleForm
      initial={{
        id: data.id,
        title: data.title,
        slug: data.slug,
        dek: data.dek ?? '',
        cover_image_url: data.cover_image_url ?? '',
        tags: (data.tags as string[]).join(', '),
        author: data.author,
        body: data.body ?? '',
        status: data.status as 'draft' | 'published' | 'archived',
      }}
    />
  )
}
