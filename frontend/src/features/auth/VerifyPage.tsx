import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiClientError } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { Badge, Button, Card, ErrorNote, Field, Input } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'

/**
 * E-mail verification. Codes are delivered to a simulated inbox and echoed back
 * by the API (SHOW_DEV_CODES), so a reviewer can verify an account without SMTP.
 */
export default function VerifyPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setUser } = useAuth()

  const email = params.get('email') ?? ''
  const next = params.get('next') ?? '/'
  const prefillCode = params.get('code') ?? ''

  const [code, setCode] = useState(prefillCode)
  const [devCode, setDevCode] = useState(prefillCode)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { user } = await authApi.verify(email, code)
      setUser(user)
      navigate(next, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.code === 'invalid_code'
            ? 'That code is wrong or has expired. Request a new one.'
            : err.message
          : 'Could not verify the code',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function resend() {
    setError(null)
    setNotice(null)
    try {
      const result = await authApi.resend(email)
      if (result.devCode) {
        setDevCode(result.devCode)
        setCode('')
        setNotice('A new code was generated and delivered to the simulated inbox.')
      } else {
        setNotice('If that address has an unverified account, a new code is on its way.')
      }
    } catch {
      setError('Could not resend the code right now.')
    }
  }

  if (!email) {
    return (
      <div className="container-page flex justify-center py-12">
        <Card className="w-full max-w-md p-6">
          <h1 className="font-display text-xl font-bold text-ink-900">No address to verify</h1>
          <p className="mt-2 text-sm text-ink-500">Open this page from the sign-up flow.</p>
          <Link to="/sign-up" className="mt-4 inline-block">
            <Button>Create an account</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="container-page flex justify-center py-12">
      <div className="w-full max-w-md">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Confirm your e-mail</h1>
          <p className="mt-1 text-sm text-ink-500">
            We sent a 6-digit code to <span className="font-semibold text-ink-900">{email}</span>.
          </p>

          {devCode && (
            <div className="mt-4 rounded-[2px] border border-brand-200 bg-brand-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">Simulated inbox</Badge>
                <span className="font-mono text-lg font-bold tracking-widest text-brand-800">{devCode}</span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                No real e-mail is sent in this demo, so the code is shown here and pre-filled below.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Verification code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                className="text-center font-mono text-xl tracking-[0.4em]"
                required
              />
            </Field>
            <ErrorNote message={error} />
            {notice && (
              <p className="rounded-[2px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-success">
                {notice}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={code.length !== 6}>
              Confirm and continue
            </Button>
          </form>

          <button onClick={() => void resend()} className="mt-4 text-sm font-semibold text-brand-700 hover:underline">
            Send a new code
          </button>
        </Card>
      </div>
    </div>
  )
}
