import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { orderApi } from '@/api/endpoints'
import type { Order } from '@/api/types'
import { Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/format'

/** Order history / game library: every purchase with its delivered keys. */
export default function OrdersPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    orderApi
      .list()
      .then(({ orders: fetched }) => setOrders(fetched))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load orders'))
      .finally(() => setLoading(false))
  }, [user])

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in to see your library"
          description="Your purchased keys live here."
          action={<Link to="/sign-in?next=/account/orders"><Button>Sign in</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 font-display text-2xl font-extrabold text-ink-900">Your library</h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : error ? (
        <EmptyState title="Could not load your orders" description={error} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          description="When you buy a game, its key appears here immediately."
          action={<Link to="/store"><Button>Browse the store</Button></Link>}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => <OrderCard key={order.id} order={order} />)}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: Order }) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div>
          <p className="font-display font-bold text-ink-900">{order.reference}</p>
          <p className="text-xs text-ink-500">
            {new Date(order.createdAt).toLocaleString()} · {order.paymentMethod}
          </p>
          <Link
            to={`/account/support?orderId=${order.id}&category=delivery`}
            className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline"
          >
            Get help with this order
          </Link>
        </div>
        <Badge tone={order.status === 'paid' ? 'success' : order.status === 'refunded' ? 'danger' : 'neutral'}>
          {order.status}
        </Badge>
        <p className="ml-auto font-display text-lg font-bold text-ink-900">{formatMoney(order.totalCents)}</p>
      </div>

      <div className="mt-4 space-y-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-wrap gap-4">
            <img src={item.coverUrl} alt="" className="h-20 w-15 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <Link to={`/products/${item.productSlug}`} className="font-semibold text-ink-900 hover:text-brand-700">
                {item.productTitle}
              </Link>
              <p className="text-xs text-ink-500">
                {item.platformName} · {item.regionCode} · {item.sellerStore} · qty {item.quantity}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {revealed[item.id] ? (
                  item.keys.map((key) => (
                    <button
                      key={key}
                      onClick={() => void copyKey(key)}
                      title="Copy key"
                      className="rounded-lg bg-canvas px-3 py-1.5 font-mono text-sm tracking-widest text-ink-900 hover:bg-brand-50"
                    >
                      {copied === key ? 'Copied!' : key}
                    </button>
                  ))
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRevealed((prev) => ({ ...prev, [item.id]: true }))}
                  >
                    Reveal {item.keys.length} key{item.keys.length === 1 ? '' : 's'}
                  </Button>
                )}
              </div>
            </div>
            <p className="font-semibold text-ink-900">{formatMoney(item.unitPriceCents * item.quantity)}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
