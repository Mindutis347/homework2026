import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { AdminOrder, SalesSummary } from '@/api/types'
import { Badge, Card, EmptyState, SectionHeading, Skeleton } from '@/components/ui'
import { formatDate, formatMoney } from '@/lib/format'

function statusTone(status: string): 'success' | 'danger' | 'neutral' | 'accent' {
  switch (status) {
    case 'paid':
      return 'success'
    case 'pending':
      return 'accent'
    case 'refunded':
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Every order on the platform plus the ledger totals earned from them. */
export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([adminApi.orders(), adminApi.summary()])
      .then(([ordersResult, summaryResult]) => {
        if (cancelled) return
        setOrders(ordersResult.orders)
        setSummary(summaryResult)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load orders')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return <EmptyState title="Could not load the ledger" description={error} />
  }

  return (
    <div>
      <SectionHeading title="Orders & ledger" subtitle="Gross takings, the platform cut and what sellers are owed." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <LedgerTile label="Gross takings" value={summary ? formatMoney(summary.grossCents) : formatMoney(0)} />
        <LedgerTile label="Platform commission" value={summary ? formatMoney(summary.commissionCents) : formatMoney(0)} />
        <LedgerTile label="Seller payouts" value={summary ? formatMoney(summary.payoutCents) : formatMoney(0)} />
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders appear here as soon as a customer checks out." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-4 py-3">Reference</th>
                <th scope="col" className="px-4 py-3">Buyer</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Items</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.reference} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-900">{order.reference}</td>
                  <td className="px-4 py-3 text-ink-700">{order.buyerEmail}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-700">{order.items}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-900">{formatMoney(order.totalCents)}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function LedgerTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold text-ink-900">{value}</p>
    </Card>
  )
}

export { AdminOrders }
