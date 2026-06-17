import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin gate for API route handlers under `/api/admin/**`.
 *
 * Centralises the two checks every admin route needs — an authenticated user
 * AND `is_admin()` — into one call so routes don't re-implement (and drift on)
 * the auth preamble. The `middleware.ts` perimeter already blocks non-admins at
 * the edge; calling this in the handler is defense-in-depth: the route stays
 * safe even if the matcher is later loosened or the route moves out from under
 * `/api/admin`.
 *
 * Preferred over per-route inline checks because the logic lives in exactly one
 * place: a future change to how admins are determined touches this file only.
 *
 * Usage:
 * ```ts
 * export async function GET() {
 *   const { supabase, error } = await requireAdmin()
 *   if (error) return error
 *   // ...use `supabase` (the same authenticated server client).
 * }
 * ```
 *
 * `error` is a ready-to-return `NextResponse` (401 when unauthenticated, 403
 * when signed in but not an admin) or `null` on success. Destructure `user`
 * too when you need the caller's identity — after `if (error) return error` it
 * is narrowed to non-null. If the handler also pulls `error` out of a Supabase
 * result, alias this one (`error: authError`) to avoid the name clash.
 */
export async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase,
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  // Authorization goes through the SECURITY DEFINER `is_admin()` RPC rather than
  // a direct `user_roles` read, mirroring the existing route convention. Fail
  // closed: treat an RPC error the same as "not an admin".
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin')
  if (adminError || !isAdmin) {
    return {
      supabase,
      user,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { supabase, user, error: null }
}

/**
 * Admin gate for server-rendered admin pages under `/admin/**`.
 *
 * The page-layer twin of {@link requireAdmin}. Instead of returning a response,
 * it `redirect()`s to `/admin/login` on any failure — and uses the *same*
 * destination for "not signed in" and "signed in but not an admin" so we never
 * reveal that a logged-in user merely lacks the admin role.
 *
 * Returns the authenticated `supabase` client and `user` for the page to reuse
 * for its own data fetching.
 *
 * ```ts
 * export default async function Page() {
 *   const { supabase } = await requireAdminPage()
 *   // ...render; `supabase` is ready and the caller is guaranteed an admin.
 * }
 * ```
 */
export async function requireAdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error || !isAdmin) redirect('/admin/login')

  return { supabase, user }
}
