'use client'

import { useState } from 'react'

export default function YouTubeSpikePage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    const artists = input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, handle] = line.split(',').map((s) => s.trim())
        return { name, handle }
      })
      .filter((a) => a.name && a.handle)

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/youtube/spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artists }),
      })
      const json = await res.json()
      setResult(JSON.stringify(json, null, 2))
    } catch (err) {
      setResult(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>YouTube spike — OAC vs Topic channel</h1>
      <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        One artist per line: <code>Name, @handle</code>
      </p>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        style={{ width: '100%', maxWidth: '600px', display: 'block', marginBottom: '0.75rem' }}
        placeholder={'Burna Boy, @burnaboy\nWizkid, @wizkidayo'}
      />
      <button onClick={run} disabled={loading}>
        {loading ? 'Running…' : 'Run spike'}
      </button>
      {result && (
        <pre
          style={{
            marginTop: '1rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#111',
            color: '#eee',
            padding: '1rem',
          }}
        >
          {result}
        </pre>
      )}
    </div>
  )
}
