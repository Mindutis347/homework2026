import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { orderApi } from '@/api/endpoints'
import type { Order } from '@/api/types'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney } from '@/lib/format'

/**
 * Printable receipt for one order. It sits outside the site layout on purpose:
 * printing should give a clean sheet, not the header, footer and navigation.
 */
export default function ReceiptPage() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    const orderID = Number(id)
    if (!Number.isFinite(orderID)) {
      setError('That receipt does not exist.')
      setLoading(false)
      return
    }
    let cancelled = false
    orderApi
      .get(orderID)
      .then((fetched) => {
        if (!cancelled) setOrder(fetched)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load that order')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, user, authLoading])

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState
          title="Sign in to open this receipt"
          description="Receipts belong to the account that placed the order."
          action={<Link to={`/sign-in?next=/account/orders/${id}/receipt`}><Button>Sign in</Button></Link>}
        />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState
          title="Receipt unavailable"
          description={error ?? 'That order is not on this account.'}
          action={<Link to="/account/orders"><Button>Back to your library</Button></Link>}
        />
      </div>
    )
  }

  const paidByWallet = order.paymentMethod === 'wallet'
  const taxRate = order.taxBasisPoints > 0 ? order.taxBasisPoints / 100 : null

  return (
    <div className="min-h-screen bg-[#f0f0f0] px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link to="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Back to your library
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>

      <article className="mx-auto max-w-3xl bg-white p-8 text-[#14101f] shadow-card print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e4e1ea] pb-5">
          <div>
            <p className="font-display text-xl font-extrabold lowercase tracking-tight">
              keyforge<span className="text-[#4618ac]">.</span>
            </p>
            <p className="mt-1 text-xs text-[#6d6680]">Digital game keys · keyforge-blush.vercel.app</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg font-extrabold uppercase tracking-wide">Receipt</p>
            <p className="text-xs text-[#6d6680]">{order.reference}</p>
          </div>
        </header>

        <dl className="grid gap-x-8 gap-y-2 py-5 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d6680]">Placed</dt>
            <dd className="font-semibold">{new Date(order.createdAt).toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d6680]">Paid</dt>
            <dd className="font-semibold">{order.paidAt ? new Date(order.paidAt).toLocaleString() : '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d6680]">Customer</dt>
            <dd className="truncate font-semibold">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#6d6680]">Method</dt>
            <dd className="font-semibold">{paidByWallet ? 'Shop wallet' : 'Card (simulated)'}</dd>
          </div>
        </dl>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[#e4e1ea] text-left text-[0.6875rem] uppercase tracking-wide text-[#6d6680]">
              <th scope="col" className="py-2 pr-2 font-extrabold">Item</th>
              <th scope="col" className="py-2 pr-2 font-extrabold">Platform / region</th>
              <th scope="col" className="py-2 pr-2 text-right font-extrabold">Qty</th>
              <th scope="col" className="py-2 pr-2 text-right font-extrabold">Unit</th>
              <th scope="col" className="py-2 text-right font-extrabold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-[#f0eef4] align-top">
                <td className="py-2.5 pr-2">
                  <span className="font-semibold">{item.productTitle}</span>
                  <span className="block text-xs text-[#6d6680]">Sold by {item.sellerStore}</span>
                  {item.refunded && <span className="block text-xs text-[#6d6680]">Refunded</span>}
                </td>
                <td className="py-2.5 pr-2 text-xs text-[#6d6680]">
                  {item.platformName} · {item.regionCode}
                </td>
                <td className="py-2.5 pr-2 text-right">{item.quantity}</td>
                <td className="py-2.5 pr-2 text-right">{formatMoney(item.unitPriceCents)}</td>
                <td className="py-2.5 text-right font-semibold">
                  {formatMoney(item.unitPriceCents * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#6d6680]">Subtotal</dt>
              <dd>{formatMoney(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#6d6680]">
                Tax{taxRate !== null ? ` (${String(taxRate)}%)` : ''}
              </dt>
              <dd>{order.taxCents > 0 ? formatMoney(order.taxCents) : '—'}</dd>
            </div>
            <div className="flex justify-between border-t border-[#e4e1ea] pt-1.5 font-display text-base font-extrabold">
              <dt>Total</dt>
              <dd>{formatMoney(order.totalCents)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-6 border-t border-[#e4e1ea] pt-4 text-xs text-[#6d6680]">
          <p>
            {paidByWallet
              ? 'Paid from the shop wallet — wallet payments carry no transaction tax.'
              : order.taxCents > 0
                ? 'Tax was charged on this card payment. Wallet payments carry no transaction tax.'
                : 'No transaction tax was charged on this order.'}
          </p>
          <p className="mt-1">
            Simulated payment for the Eneba internship assignment. No real money moved and every key is a
            placeholder. Digital goods — delivered to your library.
          </p>
        </footer>
      </article>
    </div>
  )
}
