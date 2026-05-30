'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2">BASS Admin</h1>
        <p className="text-neutral-400 mb-8">Sign in to continue.</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-white"
          />
          {mode === 'password' && (
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-white"
            />
          )}
          <button
            type="submit"
            disabled={loading || !email || (mode === 'password' && !password)}
            className="w-full bg-white text-black font-semibold rounded-md px-4 py-3 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Signing in...' : mode === 'password' ? 'Sign in' : 'Send magic link'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setMessage(null) }}
          className="mt-4 text-sm text-neutral-500 hover:text-white transition"
        >
          {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
        </button>

        {message && (
          <p className={`mt-4 text-sm ${isError ? 'text-red-400' : 'text-green-400'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
