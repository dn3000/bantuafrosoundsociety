import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Auth-handshake surfaces that must stay reachable WITHOUT admin gating, or an
// operator could never sign in or out. Matched as exact paths or path prefixes
// (so `/admin/auth` covers `/admin/auth/callback` and `/admin/auth/signout`).
// `/api/admin/auth` is listed defensively — no such route exists today, but if
// one is ever added it must not be gated.
const PUBLIC_PATHS = ['/admin/login', '/admin/auth', '/api/admin/auth']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/admin/login'
  url.search = ''
  return NextResponse.redirect(url)
}

/**
 * Perimeter guard for the admin area. Runs on every request matched by
 * `config.matcher` (admin pages and admin API routes) and enforces, in order:
 *   1. an authenticated Supabase user, and
 *   2. `is_admin()` for that user.
 *
 * Pages redirect to `/admin/login` on failure; API routes get JSON 401/403.
 * A signed-in non-admin is sent to the same place as an anonymous visitor so
 * we don't leak that the account exists but lacks the role.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let the login page and auth handshake routes through untouched.
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request })
  }

  const isApi = pathname.startsWith('/api/admin')

  // Standard Supabase SSR cookie bridge: getUser() may refresh the session, and
  // any rotated cookies must be written onto the response we ultimately return.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return isApi
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : redirectToLogin(request)
  }

  // Single cheap index lookup via the SECURITY DEFINER is_admin() RPC. Fail
  // closed on any RPC error.
  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error || !isAdmin) {
    return isApi
      ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      : redirectToLogin(request)
  }

  return supabaseResponse
}

// Keep the matcher tight: only admin pages and admin API routes run this
// middleware. Static assets and Next internals never match (they live outside
// /admin and /api/admin), so no negative-lookahead exclusion is needed.
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
}
