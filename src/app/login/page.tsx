'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    setLoading(false)

    if (res.ok) {
      router.push('/')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--rs-bg-page)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-lg border p-8 space-y-6"
        style={{ borderColor: 'var(--rs-primary-border)' }}
      >
        <h1
          className="text-2xl font-bold text-center"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--rs-text-primary)' }}
        >
          Willwin
        </h1>

        <fieldset>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--rs-text-body)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: 'var(--rs-primary-border)', '--tw-ring-color': 'var(--rs-primary)' } as React.CSSProperties}
          />
        </fieldset>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <Button
          type="submit"
          disabled={loading || !password}
          className="w-full text-white"
          style={{ backgroundColor: 'var(--rs-primary)' }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </Button>
      </form>
    </div>
  )
}
