import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { orderApi } from '@/api/endpoints'
import type { Order } from '@/api/types'
import { Badge, Button, Card, EmptyState, PageBand, Skeleton } from '@/components/ui'
import { KeyPanel } from '@/features/account/KeyPanel'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/format'

/** Order history / game library: every purchase with its revealable keys. */
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

  // Revealing a key or refunding a line changes the order, so swap in the fresh copy.
  function replaceOrder(updated: Order) {
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
  }

  if (!user) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Your library" subtitle="Sign in to see your purchased keys." />
        <div className="container-page py-16">
          <EmptyState
            title="Sign in to see your library"
            description="Your purchased keys live here."
            action={<Link to="/sign-in?next=/account/orders"><Button>Sign in</Button></Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageBand
        eyebrow="Your account"
        title="Your library"
        subtitle="Every purchase, with its keys hidden until you ask for them."
      />

      <div className="container-page py-8">

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
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onOrderChange={replaceOrder} />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

function OrderCard({ order, onOrderChange }: { order: Order; onOrderChange: (order: Order) => void }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div>
          <p className="font-display font-bold text-brand-900">{order.reference}</p>
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
        <p className="ml-auto font-display text-lg font-extrabold text-brand-900">{formatMoney(order.totalCents)}</p>
      </div>

      <div className="mt-4 space-y-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-wrap gap-4">
            <img src={item.coverUrl} alt="" className="h-20 w-15 rounded-[2px] object-cover" />
            <div className="min-w-0 flex-1">
              <Link to={`/products/${item.productSlug}`} className="font-bold text-brand-900 hover:text-brand-700">
                {item.productTitle}
              </Link>
              <p className="text-xs text-ink-500">
                {item.platformName} · {item.regionCode} · {item.sellerStore} · qty {item.quantity}
              </p>

              <KeyPanel orderId={order.id} item={item} onOrderChange={onOrderChange} />
            </div>
            <p className={`font-bold ${item.refunded ? 'text-ink-300 line-through' : 'text-brand-900'}`}>
              {formatMoney(item.unitPriceCents * item.quantity)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
