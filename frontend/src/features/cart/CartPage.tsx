import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import { Badge, Button, Card, EmptyState, Notice, PageBand } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { useCurrency } from '@/features/currency/CurrencyContext'
import { formatMoney } from '@/lib/format'

export default function CartPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { currency } = useCurrency()
  const { cart, loading, setQuantity, remove, clear, error } = useCart()
  const [tax, setTax] = useState<{ applyOnPurchase: boolean; purchaseTaxBasisPoints: number } | null>(null)

  useEffect(() => {
    catalogApi.meta().then((meta) => setTax(meta.tax)).catch(() => undefined)
  }, [])

  if (loading && cart.items.length === 0) {
    return (
      <div>
        <PageBand eyebrow="Bag" title="Your cart" />
        <div className="container-page py-16 text-sm text-ink-500">Loading your cart…</div>
      </div>
    )
  }

  if (cart.items.length === 0) {
    return (
      <div>
        <PageBand eyebrow="Bag" title="Your cart" subtitle="Nothing here yet." />
        <div className="container-page py-16">
          <EmptyState
            title="Your cart is empty"
            description="Browse the store and add a game — keys are delivered the moment you pay."
            action={<Link to="/store"><Button>Browse the store</Button></Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageBand
        eyebrow="Bag"
        title="Your cart"
        subtitle={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} · keys delivered the moment you pay`}
      >
        <button
          onClick={() => void clear()}
          className="mt-4 rounded-[2px] border border-white/40 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white hover:border-accent-500 hover:text-accent-500"
        >
          Clear cart
        </button>
      </PageBand>

      <div className="container-page py-8">
        {!user && cart.items.length > 0 && (
          <div className="mb-4">
            <Notice tone="info">
              You are shopping as a guest. Your cart is kept in this browser — you will be asked to sign in when
              you check out.
            </Notice>
          </div>
        )}

        {error && (
          <div className="mb-4"><Notice tone="danger">{error}</Notice></div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <Card key={item.offerId} className="flex flex-wrap items-center gap-4 p-4">
                <img src={item.coverUrl} alt="" className="h-20 w-15 rounded-[2px] object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <Link to={`/products/${item.slug}`} className="font-bold text-white hover:text-accent-500">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-xs text-ink-500">
                    {item.platformName} · {item.regionCode} · sold by {item.sellerStore}
                  </p>
                  <p className="mt-1 text-sm font-bold text-accent-500">{formatMoney(item.unitPriceCents)}</p>
                </div>

                <div className="flex items-center gap-1 rounded-[2px] border border-line">
                  <button
                    aria-label="Decrease quantity"
                    className="size-8 rounded-[2px] text-lg leading-none text-ink-700 hover:bg-canvas disabled:opacity-40"
                    disabled={item.quantity <= 1}
                    onClick={() => void setQuantity(item.offerId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <button
                    aria-label="Increase quantity"
                    className="size-8 rounded-[2px] text-lg leading-none text-ink-700 hover:bg-canvas disabled:opacity-40"
                    disabled={item.quantity >= item.stock}
                    onClick={() => void setQuantity(item.offerId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>

                <div className="text-right">
                  <p className="font-display font-extrabold text-white">{formatMoney(item.lineTotalCents)}</p>
                  <button
                    onClick={() => void remove(item.offerId)}
                    className="mt-1 text-xs font-semibold text-ink-500 hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              </Card>
            ))}
          </div>

          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-32">
            <h2 className="font-display text-lg font-extrabold text-white">Summary</h2>
            <div className="space-y-2 text-sm">
              <Row label={`Items (${cart.itemCount})`} value={formatMoney(cart.subtotalCents)} />
              <Row label="Delivery" value="Digital · instant" />
              <div className="border-t border-line pt-2">
                <Row label="Total" value={formatMoney(cart.subtotalCents)} strong />
              </div>
            </div>
            <p className="text-xs text-brand-200">
              {tax && tax.applyOnPurchase && tax.purchaseTaxBasisPoints > 0
                ? `Card payments add ${tax.purchaseTaxBasisPoints / 100}% tax at checkout; paying from your shop wallet adds none.`
                : "No transaction tax on this order."}
            </p>
            <p className="text-xs text-brand-200">
              Keys stay hidden until you display them, and the purchase stays refundable until then.
            </p>
            {currency !== 'EUR' && (
              <p className="text-xs text-brand-200">
                Shown in {currency} at a fixed demo rate — you are charged in euro.
              </p>
            )}
            <Badge tone="neutral">Simulated payment — no real money</Badge>
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate(user ? '/checkout' : '/sign-in?next=/checkout')}
            >
              {user ? 'Continue to checkout' : 'Sign in to check out'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-display text-base font-extrabold text-white' : 'text-ink-700'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
