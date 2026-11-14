import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { orderApi, ticketApi } from '@/api/endpoints'
import type { Order, OrderItem, Ticket } from '@/api/types'
import { Cover } from '@/components/Cover'
import { Badge, Button, Card, EmptyState, PageBand, Skeleton } from '@/components/ui'
import { KeyPanel } from '@/features/account/KeyPanel'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/format'

/** Order history / game library: every purchase with its revealable keys, plus a
 *  direct line to support for each order and each game in it. */
export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // While the session is being restored we know nothing yet: keep the skeleton.
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    // Tickets ride along so an order can show that a request is already open.
    setLoading(true)
    Promise.all([orderApi.list(), ticketApi.list()])
      .then(([orderResult, ticketResult]) => {
        setOrders(orderResult.orders)
        setTickets(ticketResult.tickets)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load orders'))
      .finally(() => setLoading(false))
  }, [user, authLoading])

  const ticketsByOrder = new Map<string, Ticket>()
  for (const ticket of tickets) {
    if (ticket.orderReference && !ticketsByOrder.has(ticket.orderReference)) {
      ticketsByOrder.set(ticket.orderReference, ticket)
    }
  }

  // Revealing a key or refunding a line changes the order, so swap in the fresh copy.
  function replaceOrder(updated: Order) {
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
  }

  if (authLoading) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Your library" subtitle="Loading your purchases…" />
        <div className="container-page space-y-3 py-8">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      </div>
    )
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
            <OrderCard
              key={order.id}
              order={order}
              ticket={ticketsByOrder.get(order.reference)}
              onOrderChange={replaceOrder}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

/** Deep link into the support form with the order (and optionally the game) prefilled. */
function supportHref(order: Order, item?: OrderItem) {
  const query = new URLSearchParams({ orderId: String(order.id), category: 'delivery' })
  if (item) query.set('subject', `Problem with ${item.productTitle}`)
  return `/account/support?${query.toString()}`
}

function OrderCard({
  order,
  ticket,
  onOrderChange,
}: {
  order: Order
  ticket?: Ticket
  onOrderChange: (order: Order) => void
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <div>
          <p className="font-display font-bold text-white">{order.reference}</p>
          <p className="text-xs text-ink-500">
            {new Date(order.createdAt).toLocaleString()} · {order.paymentMethod}
          </p>
        </div>
        <Badge tone={order.status === 'paid' ? 'success' : order.status === 'refunded' ? 'danger' : 'neutral'}>
          {order.status}
        </Badge>
        {ticket && (
          <Badge tone={ticket.status === 'resolved' ? 'neutral' : 'accent'}>
            support: {ticket.status.replace('_', ' ')}
          </Badge>
        )}
        <Link to={supportHref(order)} className="text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline">
          Contact support
        </Link>
        <div className="ml-auto text-right">
          <p className="font-display text-lg font-extrabold text-white">{formatMoney(order.totalCents)}</p>
          {order.taxCents > 0 && (
            <p className="text-[0.6875rem] text-brand-200">
              incl. {formatMoney(order.taxCents)} tax
              {order.taxBasisPoints > 0 ? ` (${order.taxBasisPoints / 100}%)` : ""}
            </p>
          )}
          <Link
            to={`/account/orders/${order.id}/receipt`}
            className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-accent-500 hover:underline"
          >
            Receipt
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-wrap gap-4">
            <Cover
              productId={item.productId}
              url={item.coverUrl}
              alt=""
              sizes="80px"
              widths={[160, 240]}
              fallbackWidth={160}
              loading="lazy"
              className="h-20 w-15 rounded-[2px] object-cover"
            />
            <div className="min-w-0 flex-1">
              <Link to={`/products/${item.productSlug}`} className="font-bold text-white hover:text-accent-500">
                {item.productTitle}
              </Link>
              <p className="text-xs text-ink-500">
                {item.platformName} · {item.regionCode} · {item.sellerStore} · qty {item.quantity}
              </p>

              <KeyPanel orderId={order.id} item={item} onOrderChange={onOrderChange} />

              {!item.refunded && (
                <Link
                  to={supportHref(order, item)}
                  className="mt-2 inline-block text-xs font-semibold text-brand-200 hover:text-accent-500 hover:underline"
                >
                  Report a problem with this game
                </Link>
              )}
            </div>
            <p className={`font-bold ${item.refunded ? 'text-ink-300 line-through' : 'text-white'}`}>
              {formatMoney(item.unitPriceCents * item.quantity)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
