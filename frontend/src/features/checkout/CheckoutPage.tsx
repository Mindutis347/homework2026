import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { orderApi } from '@/api/endpoints'
import { ApiClientError } from '@/api/client'
import type { CheckoutQuote, Order } from '@/api/types'
import { Cover } from '@/components/Cover'
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageBand } from '@/components/ui'
import { KeyPanel } from '@/features/account/KeyPanel'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { useMarket } from '@/features/market/MarketContext'
import { formatMoney } from '@/lib/format'

/**
 * Simulated checkout. The whole purchase is one backend transaction: the order,
 * the key allocation and the stock decrement either all happen or none do.
 */
export default function CheckoutPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { currency } = useMarket()
  const { cart, refresh } = useCart()

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [cardName, setCardName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [method, setMethod] = useState<"card" | "wallet">("card")
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoting, setQuoting] = useState(true)

  // One key per checkout attempt-group: retrying a double-submit replays the
  // same order instead of charging twice.
  const idempotencyKey = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    if (!authLoading && !user) navigate('/sign-in?next=/checkout', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setQuoting(true)
    orderApi
      .quote(method)
      .then(({ quote: fetched }) => {
        if (!cancelled) setQuote(fetched)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setQuoting(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, method])

  async function pay(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await orderApi.checkout(cardNumber, idempotencyKey.current, method)
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
    return <OrderConfirmation order={order} onOrderChange={setOrder} />
  }

  if (!user) {
    return (
      <div>
        <PageBand eyebrow="Checkout" title="Payment" subtitle="Sign in to complete your purchase." />
        <div className="container-page py-16">
          <EmptyState
            title="Sign in to check out"
            description="Your cart and your keys are tied to your account."
            action={<Link to="/sign-in?next=/checkout"><Button>Sign in</Button></Link>}
          />
        </div>
      </div>
    )
  }

  if (cart.items.length === 0) {
    return (
      <div>
        <PageBand eyebrow="Checkout" title="Payment" subtitle="Your cart is empty, so there is nothing to pay for." />
        <div className="container-page py-16">
          <EmptyState
            title="Nothing to check out"
            description="Your cart is empty."
            action={<Link to="/store"><Button>Browse the store</Button></Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageBand
        eyebrow="Checkout"
        title="Payment"
        subtitle="Simulated payment · keys are assigned inside one database transaction"
      />

      <div className="container-page py-8">
        {!user.isVerified && (
          <div className="mb-5">
            <Notice tone="warning">
              Confirm your e-mail to complete the purchase. We sent a 6-digit code to {user.email}.{' '}
              <Link to={`/verify?email=${encodeURIComponent(user.email)}`} className="underline">
                Enter it here
              </Link>
              .
            </Notice>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form onSubmit={pay} className="space-y-4">
            <Card className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-extrabold text-white">Payment method</h2>
                <Badge tone="neutral">Simulated</Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: "card", label: "Card", hint: "Taxes apply" },
                  {
                    value: "wallet",
                    label: "Shop wallet",
                    hint: quote ? `${formatMoney(quote.walletBalanceCents)} available · no tax` : "No tax",
                  },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={method === option.value}
                    onClick={() => setMethod(option.value)}
                    className={`rounded-[2px] border px-3 py-2.5 text-left transition ${
                      method === option.value
                        ? "border-accent-500 bg-accent-500/15"
                        : "border-line hover:border-white/40"
                    }`}
                  >
                    <span className="block text-sm font-extrabold text-white">{option.label}</span>
                    <span className="block text-xs text-brand-200">{option.hint}</span>
                  </button>
                ))}
              </div>

              {method === "wallet" ? (
                <div className="space-y-2">
                  <p className="flex flex-wrap items-baseline gap-2 text-sm text-brand-100">
                    <span>
                      Balance:{" "}
                      <span className="font-extrabold text-white">
                        {formatMoney(quote?.walletBalanceCents ?? 0)}
                      </span>
                    </span>
                    <Link to="/account/wallet" className="text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline">
                      Top up
                    </Link>
                  </p>
                  {quote && quote.walletBalanceCents < quote.totalCents && (
                    <Notice tone="warning">
                      Not enough for this order.{" "}
                      <Link to="/account/wallet" className="underline">Top up your wallet</Link> or pay by card.
                    </Notice>
                  )}
                </div>
              ) : (
                <>
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
                </>
              )}

              <ErrorNote message={error} />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={submitting}
                disabled={!user.isVerified || quoting}
              >
                {!user.isVerified
                  ? "Verify your e-mail first"
                  : `Pay ${formatMoney(quote?.totalCents ?? cart.subtotalCents)} ${
                      method === "wallet" ? "from wallet" : "by card"
                    }`}
              </Button>
            </Card>
          </form>

          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-32">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-extrabold text-white">Order summary</h2>
              <Link
                to="/cart"
                className="text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline"
              >
                Edit cart
              </Link>
            </div>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div key={item.offerId} className="flex gap-3">
                  <Cover
                    productId={item.productId}
                    url={item.coverUrl}
                    alt=""
                    sizes="56px"
                    widths={[160, 240]}
                    fallbackWidth={160}
                    className="h-14 w-10 rounded-[2px] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{item.title}</p>
                    <p className="text-xs text-ink-500">
                      {item.platformName} · {item.regionCode} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{formatMoney(item.lineTotalCents)}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-line pt-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-brand-100">
                  <span>Subtotal</span>
                  <span>{formatMoney(quote?.subtotalCents ?? cart.subtotalCents)}</span>
                </div>
                {quote && quote.taxCents > 0 && (
                  <div className="flex justify-between text-brand-100">
                    <span>Tax ({(quote.taxBasisPoints / 100).toFixed(2).replace(/\.00$/, "")}%)</span>
                    <span>{formatMoney(quote.taxCents)}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 flex justify-between font-display text-base font-extrabold text-white">
                <span>Total</span>
                <span>{formatMoney(quote?.totalCents ?? cart.subtotalCents)}</span>
              </div>
            </div>
            <p className="text-xs text-brand-200">
              {method === "wallet"
                ? "Paid from your shop wallet — no transaction tax."
                : "Tax is added on card payments only; a wallet top-up is the tax-free alternative."}
            </p>
            {currency !== "EUR" && (
              <p className="text-xs text-brand-200">
                Prices are shown in {currency} at a fixed demo rate; the simulated charge is always in euro.
              </p>
            )}
            <p className="text-xs text-ink-500">
              Keys are reserved and assigned inside a single database transaction. If any key runs out,
              nothing is charged and your cart is kept.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function OrderConfirmation({ order, onOrderChange }: { order: Order; onOrderChange: (order: Order) => void }) {
  const outstanding = order.items.filter((item) => !item.refunded)
  return (
    <div>
      <PageBand
        eyebrow="Order confirmed"
        title="Payment complete"
        subtitle={`Order ${order.reference}`}
      />

      <div className="container-page py-8">
        <Card className="mx-auto max-w-2xl p-6">
          <Notice tone="success">
            Your {outstanding.length === 1 ? 'key is' : 'keys are'} reserved and hidden. Display a key when you are
            ready to use it — after that the purchase can no longer be refunded.
          </Notice>

          <div className="mt-6 space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-[2px] border border-line p-4">
                <p className="font-bold text-white">{item.productTitle}</p>
                <p className="text-xs text-ink-500">
                  {item.platformName} · {item.regionCode} · from {item.sellerStore} ·{' '}
                  {formatMoney(item.unitPriceCents * item.quantity)}
                </p>
                <KeyPanel orderId={order.id} item={item} onOrderChange={onOrderChange} />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 border-t border-line pt-3">
            <span className="text-sm text-brand-200">Total</span>
            <span className="font-display text-lg font-extrabold text-white">{formatMoney(order.totalCents)}</span>
            <span className="w-full text-right text-xs text-brand-200 sm:w-auto">
              {order.taxCents > 0
                ? `incl. ${formatMoney(order.taxCents)} tax${order.taxBasisPoints > 0 ? ` (${order.taxBasisPoints / 100}%)` : ""}`
                : order.paymentMethod === "wallet"
                  ? "no transaction tax (paid from wallet)"
                  : "no transaction tax"}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/account/orders/${order.id}/receipt`}><Button>Print receipt</Button></Link>
            <Link to="/account/orders"><Button variant="ghost">View order history</Button></Link>
            <Link to="/store"><Button variant="ghost">Keep shopping</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
