import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSpotifyAuthUrl } from '@/lib/spotify'
import { randomBytes } from 'crypto'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  // CSRF state — random nonce stored in a short-lived httpOnly cookie
  const state = randomBytes(16).toString('hex')

  const { origin } = new URL(request.url)
  const redirectUri = `${origin}/api/auth/spotify/callback`
  const authUrl = buildSpotifyAuthUrl({ redirectUri, state })

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
