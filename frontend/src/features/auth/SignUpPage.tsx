import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiClientError } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui'

export default function SignUpPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await authApi.register(email, password, displayName)
      // The code is shown on the verify screen (simulated e-mail). It is only
      // returned because SHOW_DEV_CODES is on for this demo deployment.
      navigate(
        `/verify?email=${encodeURIComponent(result.user.email)}&next=${encodeURIComponent(next)}${
          result.devCode ? `&code=${result.devCode}` : ''
        }`,
      )
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.code === 'email_taken'
            ? 'That e-mail already has an account. Try signing in instead.'
            : err.message,
        )
      } else if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container-page flex justify-center py-12">
      <div className="w-full max-w-md">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">
            You start as a customer. Sellers are promoted by an administrator.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Display name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="nickname"
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Create account
            </Button>
          </form>

          <p className="mt-4 text-sm text-ink-500">
            Already registered?{' '}
            <Link to={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
