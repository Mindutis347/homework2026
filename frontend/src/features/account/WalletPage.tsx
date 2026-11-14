import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { walletApi } from '@/api/endpoints'
import type { Wallet } from '@/api/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Notice,
  PageBand,
  Skeleton,
} from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/format'

const PRESETS = [1000, 2500, 5000]

/** Prepaid shop wallet: top up with the simulated card, then pay without a card
 *  at checkout (and without transaction tax, which is the demo's incentive). */
export default function WalletPage() {
  const { user, loading: authLoading } = useAuth()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState('25')
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [toppingUp, setToppingUp] = useState(false)
  const [receipt, setReceipt] = useState<{ credited: number; tax: number; charged: number } | null>(null)

  useEffect(() => {
    // The balance is unknown until the session resolves; do not show €0.00.
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    walletApi
      .get()
      .then(({ wallet: fetched }) => {
        if (cancelled) return
        setWallet(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load your wallet')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  async function topUp(event: React.FormEvent) {
    event.preventDefault()
    setReceipt(null)
    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents < 100) {
      setError('Enter an amount of at least €1.')
      return
    }
    setToppingUp(true)
    setError(null)
    try {
      const result = await walletApi.topup(cents, cardNumber)
      setReceipt({ credited: cents, tax: result.taxCents, charged: result.chargedCents })
      const { wallet: refreshed } = await walletApi.get()
      setWallet(refreshed)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not top up your wallet')
    } finally {
      setToppingUp(false)
    }
  }

  if (authLoading) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Shop wallet" subtitle="Loading your balance…" />
        <div className="container-page space-y-3 py-8">
          {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Shop wallet" subtitle="Sign in to use the prepaid balance." />
        <div className="container-page py-16">
          <EmptyState
            title="Sign in to see your wallet"
            description="A wallet balance can be spent at checkout without a card."
            action={<Link to="/sign-in?next=/account/wallet"><Button>Sign in</Button></Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageBand
        eyebrow="Your account"
        title="Shop wallet"
        subtitle="Top up once, then pay at checkout from the balance."
      />

      <div className="container-page py-8">
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card className="p-5">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand-200">Balance</p>
              {loading ? (
                <Skeleton className="mt-2 h-9 w-40" />
              ) : (
                <p className="mt-1 font-display text-3xl font-extrabold text-accent-500">
                  {formatMoney(wallet?.balanceCents ?? 0)}
                </p>
              )}
              <p className="mt-2 text-sm text-brand-100">
                Paying from the wallet skips the transaction tax that card payments carry.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-lg font-extrabold text-white">Top up</h2>
              <form onSubmit={topUp} className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((cents) => (
                    <Button
                      key={cents}
                      type="button"
                      size="sm"
                      variant={Math.round(Number(amount) * 100) === cents ? 'primary' : 'onDark'}
                      onClick={() => setAmount(String(cents / 100))}
                    >
                      {formatMoney(cents)}
                    </Button>
                  ))}
                </div>

                <Field label="Amount (EUR)" hint="Between €1 and €500.">
                  <Input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    aria-label="Top-up amount in euro"
                  />
                </Field>

                <Field
                  label="Card number"
                  hint="Simulated. Any number works; one ending 0002 is declined on purpose."
                >
                  <Input
                    value={cardNumber}
                    onChange={(event) => setCardNumber(event.target.value)}
                    inputMode="numeric"
                    aria-label="Card number for the top-up"
                  />
                </Field>

                {receipt && (
                  <Notice tone="success">
                    Credited {formatMoney(receipt.credited)}
                    {receipt.tax > 0
                      ? ` · tax ${formatMoney(receipt.tax)} · card charged ${formatMoney(receipt.charged)}`
                      : " · no tax on this top-up"}
                  </Notice>
                )}

                <Button type="submit" loading={toppingUp}>
                  Top up {amount ? formatMoney(Math.round(Number(amount) * 100)) : ''}
                </Button>
              </form>
            </Card>
          </div>

          <Card className="h-fit p-5">
            <h2 className="font-display text-lg font-extrabold text-white">History</h2>
            {loading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
              </div>
            ) : (wallet?.transactions.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-brand-200">No movements yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {wallet?.transactions.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 border-b border-line pb-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">
                        {entry.kind === 'topup' ? 'Top-up' : 'Purchase'}
                        <span className="ml-2 text-xs font-semibold text-brand-300">{entry.reference}</span>
                      </p>
                      <p className="text-xs text-brand-200">
                        {new Date(entry.createdAt).toLocaleString()}
                        {entry.taxCents > 0 ? ` · tax ${formatMoney(entry.taxCents)}` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-extrabold ${entry.kind === 'topup' ? 'text-mint-400' : 'text-white'}`}>
                      {entry.kind === 'topup' ? '+' : '−'}
                      {formatMoney(entry.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <Badge tone="neutral">Simulated payments only</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
