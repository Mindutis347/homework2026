import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { orderApi } from '@/api/endpoints'
import { ApiClientError } from '@/api/client'
import type { Order } from '@/api/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { formatMoney } from '@/lib/format'

/**
 * Simulated checkout. The whole purchase is one backend transaction: the order,
 * the key allocation and the stock decrement either all happen or none do.
 */
export default function CheckoutPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { cart, refresh } = useCart()

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [cardName, setCardName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  // One key per checkout attempt-group: retrying a double-submit replays the
  // same order instead of charging twice.
  const idempotencyKey = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    if (!authLoading && !user) navigate('/sign-in?next=/checkout', { replace: true })
  }, [authLoading, user, navigate])

  async function pay(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await orderApi.checkout(cardNumber, idempotencyKey.current)
      setOrder(result.order)
      idempotencyKey.current = crypto.randomUUID()
      await refresh()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.code === 'payment_declined'
            ? 'That card was declined. Any number works except one ending 0002 (our test decline card).'
            : err.message,
        )
      } else if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (order) {
    return <OrderConfirmation order={order} />
  }

  if (!user) return null

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty."
          action={<Link to="/store"><Button>Browse the store</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 font-display text-2xl font-extrabold text-ink-900">Checkout</h1>

      {!user.isVerified && (
        <Card className="mb-5 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-ink-900">Confirm your e-mail to complete the purchase</p>
          <p className="mt-1 text-sm text-ink-700">
            We sent a 6-digit code to {user.email}.{' '}
            <Link to={`/verify?email=${encodeURIComponent(user.email)}`} className="font-semibold text-brand-700 underline">
              Enter it here
            </Link>
            .
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={pay} className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink-900">Payment</h2>
              <Badge tone="neutral">Simulated</Badge>
            </div>
            <Field label="Cardholder name">
              <Input
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Demo Buyer"
                autoComplete="name"
              />
            </Field>
            <Field
              label="Card number"
              hint="Test mode: any number succeeds. Use a number ending in 0002 to see the decline path."
            >
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                inputMode="numeric"
                autoComplete="cc-number"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry">
                <Input defaultValue="12 / 30" autoComplete="cc-exp" />
              </Field>
              <Field label="CVC">
                <Input defaultValue="123" inputMode="numeric" autoComplete="cc-csc" />
              </Field>
            </div>
            <ErrorNote message={error} />
            <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!user.isVerified}>
              {user.isVerified ? `Pay ${formatMoney(cart.subtotalCents)}` : 'Verify your e-mail first'}
            </Button>
          </Card>
        </form>

        <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-bold text-ink-900">Order summary</h2>
          <div className="space-y-3">
            {cart.items.map((item) => (
              <div key={item.offerId} className="flex gap-3">
                <img src={item.coverUrl} alt="" className="h-14 w-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.title}</p>
                  <p className="text-xs text-ink-500">
                    {item.platformName} · {item.regionCode} × {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatMoney(item.lineTotalCents)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-3">
            <div className="flex justify-between font-display text-base font-bold text-ink-900">
              <span>Total</span>
              <span>{formatMoney(cart.subtotalCents)}</span>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            Keys are reserved and assigned inside a single database transaction. If any key runs out,
            nothing is charged and your cart is kept.
          </p>
        </Card>
      </div>
    </div>
  )
}

function OrderConfirmation({ order }: { order: Order }) {
  return (
    <div className="container-page py-10">
      <Card className="mx-auto max-w-2xl p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-emerald-50 text-xl text-success">✓</span>
          <div>
            <h1 className="font-display text-xl font-extrabold text-ink-900">Payment complete</h1>
            <p className="text-sm text-ink-500">
              Order {order.reference} · {formatMoney(order.totalCents)}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-line p-4">
              <p className="font-semibold text-ink-900">{item.productTitle}</p>
              <p className="text-xs text-ink-500">
                {item.platformName} · {item.regionCode} · from {item.sellerStore}
              </p>
              <div className="mt-3 space-y-1">
                {item.keys.map((key) => (
                  <code
                    key={key}
                    className="block rounded-lg bg-canvas px-3 py-2 font-mono text-sm tracking-widest text-ink-900"
                  >
                    {key}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/account/orders"><Button>View order history</Button></Link>
          <Link to="/store"><Button variant="ghost">Keep shopping</Button></Link>
        </div>
      </Card>
    </div>
  )
}
