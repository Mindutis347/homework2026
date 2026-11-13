import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiClientError } from '@/api/client'
import { Button, Card, ErrorNote, Field, Input, PageBand } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'

export default function SignInPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const next = params.get('next') ?? '/'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await signIn(email, password)
      if (!user.isVerified) {
        navigate(`/verify?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(next)}`)
      } else {
        navigate(next, { replace: true })
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === 'invalid_credentials'
          ? 'Wrong e-mail or password.'
          : err instanceof Error
            ? err.message
            : 'Could not sign in',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail)
    setPassword(demoPassword)
  }

  return (
    <div>
      <PageBand
        eyebrow="Your account"
        title="Sign in"
        subtitle="Sign in to check out and see your keys."
      />

      <div className="container-page flex justify-center py-12">
        <div className="w-full max-w-md">
          <Card className="p-6">
          <form onSubmit={submit} className="mt-6 space-y-4">
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
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-sm text-ink-500">
            No account?{' '}
            <Link to={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">
              Create one
            </Link>
          </p>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Demo accounts for reviewers</p>
          <div className="mt-2 space-y-1.5 text-sm">
            <DemoRow label="Buyer" email="demo@keyforge.dev" password="Demo#2026" onFill={fillDemo} />
            <DemoRow label="Admin" email="admin@keyforge.dev" password="Admin#2026" onFill={fillDemo} />
            <DemoRow label="Seller" email="seller1@keyforge.dev" password="Seller#2026" onFill={fillDemo} />
          </div>
        </Card>
      </div>
    </div>
    </div>
  )
}

function DemoRow({
  label,
  email,
  password,
  onFill,
}: {
  label: string
  email: string
  password: string
  onFill: (email: string, password: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onFill(email, password)}
      className="flex w-full items-center justify-between rounded-[2px] px-2 py-1.5 text-left hover:bg-canvas"
    >
      <span>
        <span className="font-semibold text-ink-900">{label}</span>
        <span className="ml-2 text-ink-500">{email}</span>
      </span>
      <span className="text-xs font-semibold text-brand-700">Use</span>
    </button>
  )
}
