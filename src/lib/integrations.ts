import { createClient } from '@/lib/supabase/server'
import { refreshSpotifyToken } from '@/lib/spotify'

type IntegrationRow = {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string
  scope: string | null
  provider_user_id: string | null
  provider_display_name: string | null
}

// Returns a valid Spotify user-auth access token for the current admin,
// refreshing it if expired. Returns null if no Spotify integration exists.
export async function getSpotifyUserAccessToken(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .maybeSingle()

  if (!integration) return null
  const row = integration as IntegrationRow

  const expiresAt = new Date(row.expires_at).getTime()
  const now = Date.now()
  // Refresh if expires within 60 seconds
  if (expiresAt - now > 60_000) {
    return row.access_token
  }

  if (!row.refresh_token) return null

  try {
    const refreshed = await refreshSpotifyToken(row.refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    const newRefreshToken = refreshed.refresh_token || row.refresh_token

    await supabase
      .from('integrations')
      .update({
        access_token: refreshed.access_token,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
        scope: refreshed.scope || row.scope,
      })
      .eq('id', row.id)

    return refreshed.access_token
  } catch (err) {
    console.error('Spotify token refresh failed:', err)
    return null
  }
}

export async function getSpotifyIntegrationMeta(): Promise<{
  connected: boolean
  providerDisplayName: string | null
  providerUserId: string | null
  expiresAt: string | null
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('integrations')
    .select('provider_display_name, provider_user_id, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .maybeSingle()

  if (!data) {
    return { connected: false, providerDisplayName: null, providerUserId: null, expiresAt: null }
  }
  return {
    connected: true,
    providerDisplayName: data.provider_display_name as string | null,
    providerUserId: data.provider_user_id as string | null,
    expiresAt: data.expires_at as string,
  }
}
