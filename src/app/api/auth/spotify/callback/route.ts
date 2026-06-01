import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeSpotifyCode, fetchSpotifyMe } from '@/lib/spotify'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const stateCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('spotify_oauth_state='))
    ?.split('=')[1]

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/integrations?error=${encodeURIComponent(error)}`, request.url)
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/admin/integrations?error=missing_params', request.url)
    )
  }
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.redirect(
      new URL('/admin/integrations?error=state_mismatch', request.url)
    )
  }

  try {
    const redirectUri = `${url.origin}/api/auth/spotify/callback`
    const tokens = await exchangeSpotifyCode({ code, redirectUri })
    const me = await fetchSpotifyMe(tokens.access_token)

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await supabase
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          provider: 'spotify',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scope: tokens.scope,
          provider_user_id: me.id,
          provider_display_name: me.display_name,
        },
        { onConflict: 'user_id,provider' }
      )

    const response = NextResponse.redirect(
      new URL('/admin/integrations?connected=spotify', request.url)
    )
    // Clear the state cookie
    response.cookies.set('spotify_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(
      new URL(`/admin/integrations?error=${encodeURIComponent(msg)}`, request.url)
    )
  }
}
