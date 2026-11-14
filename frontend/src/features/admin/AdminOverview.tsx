import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { SalesSummary } from '@/api/types'
import { TableShell } from '@/components/TableShell'
import { Card, EmptyState, SectionHeading, Skeleton } from '@/components/ui'
import { formatEuro } from '@/lib/format'

/** Platform-wide sales picture: headline tiles, per-seller ranking and the last
 *  two weeks of volume as a plain bar list. */
export default function AdminOverview() {
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .summary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the summary')
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (error) {
    return <EmptyState title="Could not load the overview" description={error} />
  }

  if (!summary) {
    return <EmptyState title="No sales data yet" description="Numbers appear here after the first paid order." />
  }

  const maxDailyRevenue = summary.daily.reduce((max, entry) => Math.max(max, entry.revenueCents), 0)

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading title="Sales overview" subtitle={`${summary.activeSellers} active seller${summary.activeSellers === 1 ? '' : 's'}`} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tile label="Orders" value={String(summary.orders)} />
          <Tile label="Units sold" value={String(summary.unitsSold)} />
          <Tile label="Gross revenue" value={formatEuro(summary.grossCents)} />
          <Tile label="Platform commission" value={formatEuro(summary.commissionCents)} />
          <Tile label="Seller payouts" value={formatEuro(summary.payoutCents)} />
          <Tile label="Average order value" value={formatEuro(summary.avgOrderCents)} />
        </div>
      </section>

      <section>
        <SectionHeading title="Top sellers" subtitle="Ranked by units sold" />
        {summary.topSellers.length === 0 ? (
          <EmptyState title="No seller activity yet" description="Seller performance appears once keys are sold." />
        ) : (
          <Card>
            <TableShell>
            <table className="w-full min-w-[380px] text-sm sm:min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3">Store</th>
                  <th scope="col" className="px-4 py-3 text-right">Units</th>
                  <th scope="col" className="px-4 py-3 text-right">Revenue</th>
                  <th scope="col" className="px-4 py-3 text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {summary.topSellers.map((seller) => (
                  <tr key={seller.storeName} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink-900">{seller.storeName}</td>
                    <td className="px-4 py-3 text-right text-ink-700">{seller.unitsSold}</td>
                    <td className="px-4 py-3 text-right text-ink-700">{formatEuro(seller.revenueCents)}</td>
                    <td className="px-4 py-3 text-right text-ink-700">{formatEuro(seller.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableShell>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading title="Last 14 days" subtitle="Revenue per day, scaled to the busiest day" />
        <Card className="space-y-2 p-4">
          {summary.daily.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">No days to show yet.</p>
          ) : (
            summary.daily.map((entry) => {
              const width = maxDailyRevenue > 0 ? Math.max(2, (entry.revenueCents / maxDailyRevenue) * 100) : 0
              return (
                <div key={entry.day} className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
                  <span className="text-xs font-semibold text-ink-500">{dayLabel(entry.day)}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-canvas" title={`${entry.orders} orders`}>
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-700">
                    {entry.orders} order{entry.orders === 1 ? '' : 's'} · {formatEuro(entry.revenueCents)}
                  </span>
                </div>
              )
            })
          )}
        </Card>
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink-900">{value}</p>
    </Card>
  )
}

function dayLabel(day: string): string {
  const parsed = new Date(day)
  if (Number.isNaN(parsed.getTime())) return day
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(parsed)
}

export { AdminOverview }
