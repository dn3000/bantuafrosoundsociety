'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/Logo'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setIsError(false)

    const supabase = createClient()

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        setIsError(true)
        setMessage(error.message)
      } else {
        router.push('/admin')
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/admin/auth/callback` },
      })
      setLoading(false)
      if (error) {
        setIsError(true)
        setMessage(error.message)
      } else {
        setMessage('Check your email for the magic link to sign in.')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg-base)]">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <Logo variant="mark" className="h-12 w-auto mb-6" priority />
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-primary)]">BASS Admin</h1>
          <p className="text-sm text-[var(--color-fg-secondary)] mt-2">
            Sign in with your email to continue.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-3 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
          />
          {mode === 'password' && (
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[var(--radius)] px-4 py-3 text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-tertiary)] focus:border-[var(--color-border-strong)] transition-colors"
            />
          )}
          <button
            type="submit"
            disabled={loading || !email || (mode === 'password' && !password)}
            className="w-full bg-[var(--color-accent)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius)] px-4 py-3 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : mode === 'password' ? 'Sign in' : 'Send magic link'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setMessage(null) }}
          className="mt-4 text-sm text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
        >
          {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
        </button>

        {message && (
          <p className={`mt-4 text-sm ${isError ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
