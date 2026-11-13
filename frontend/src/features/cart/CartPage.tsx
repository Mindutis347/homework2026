import { Link, useNavigate } from 'react-router-dom'

import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { formatMoney } from '@/lib/format'

export default function CartPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { cart, loading, setQuantity, remove, clear, error } = useCart()

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in to use your cart"
          description="Your cart is tied to your account so your keys are always delivered to you."
          action={<Link to="/sign-in?next=/cart"><Button>Sign in</Button></Link>}
        />
      </div>
    )
  }

  if (loading && cart.items.length === 0) {
    return <div className="container-page py-16 text-sm text-ink-500">Loading your cart…</div>
  }

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Your cart is empty"
          description="Browse the store and add a game — keys are delivered the moment you pay."
          action={<Link to="/store"><Button>Browse the store</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Your cart</h1>
        <Button variant="ghost" size="sm" onClick={() => void clear()}>Clear cart</Button>
      </div>

      {error && (
        <p className="mb-4 rounded-[2px] border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {cart.items.map((item) => (
            <Card key={item.offerId} className="flex flex-wrap items-center gap-4 p-4">
              <img src={item.coverUrl} alt="" className="h-20 w-15 rounded object-cover" loading="lazy" />
              <div className="min-w-0 flex-1">
                <Link to={`/products/${item.slug}`} className="font-semibold text-ink-900 hover:text-brand-700">
                  {item.title}
                </Link>
                <p className="mt-1 text-xs text-ink-500">
                  {item.platformName} · {item.regionCode} · sold by {item.sellerStore}
                </p>
                <p className="mt-1 text-sm font-semibold text-brand-700">{formatMoney(item.unitPriceCents)}</p>
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
                <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
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
                <p className="font-display font-bold text-ink-900">{formatMoney(item.lineTotalCents)}</p>
                <button
                  onClick={() => void remove(item.offerId)}
                  className="mt-1 text-xs text-ink-500 hover:text-danger"
                >
                  Remove
                </button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-bold text-ink-900">Summary</h2>
          <div className="space-y-2 text-sm">
            <Row label={`Items (${cart.itemCount})`} value={formatMoney(cart.subtotalCents)} />
            <Row label="Delivery" value="Digital · instant" />
            <div className="border-t border-line pt-2">
              <Row label="Total" value={formatMoney(cart.subtotalCents)} strong />
            </div>
          </div>
          <Badge tone="neutral">Simulated payment — no real money</Badge>
          <Button className="w-full" size="lg" onClick={() => navigate('/checkout')}>
            Continue to checkout
          </Button>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-display text-base font-bold text-ink-900' : 'text-ink-700'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
