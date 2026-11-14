import { useEffect, useState } from 'react'

import { merchantApi } from '@/api/endpoints'
import type { MerchantSale, MerchantStats } from '@/api/types'
import { TableShell } from '@/components/TableShell'
import { Card, EmptyState, ErrorNote, SectionHeading, Skeleton } from '@/components/ui'
import { formatDate, formatEuro } from '@/lib/format'

/** Seller dashboard: top-line numbers plus the latest deliveries. */
export default function MerchantOverview() {
  const [stats, setStats] = useState<MerchantStats | null>(null)
  const [sales, setSales] = useState<MerchantSale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([merchantApi.stats(), merchantApi.sales()])
      .then(([fetchedStats, fetchedSales]) => {
        if (cancelled) return
        setStats(fetchedStats)
        setSales(fetchedSales.sales)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load your dashboard')
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
      <div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    )
  }

  if (error || !stats) {
    return <ErrorNote message={error ?? 'Could not load your dashboard'} />
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active offers"
          value={String(stats.activeOffers)}
          hint={`${stats.offers} listing${stats.offers === 1 ? '' : 's'} in total`}
        />
        <StatTile
          label="Keys available"
          value={stats.keysAvailable.toLocaleString()}
          hint="ready to deliver"
        />
        <StatTile
          label="Keys sold"
          value={stats.keysSold.toLocaleString()}
          hint="all time"
        />
        <StatTile
          label="Revenue"
          value={formatEuro(stats.revenueCents)}
          hint={`Your payout ${formatEuro(stats.payoutCents)}`}
          tone="brand"
        />
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Recent sales"
          subtitle="The latest keys your store delivered, with commission already deducted."
        />

        {sales.length === 0 ? (
          <EmptyState
            title="No sales yet"
            description="Once a shopper buys one of your offers, the sale and your payout show up here."
          />
        ) : (
          <Card className="overflow-hidden">
            <div>
              <TableShell>
              <table className="w-full min-w-[420px] text-left text-sm sm:min-w-[720px]">
                <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Order</th>
                    <th scope="col" className="px-4 py-3">Product</th>
                    <th scope="col" className="px-4 py-3 text-right">Qty</th>
                    <th scope="col" className="px-4 py-3 text-right">Unit price</th>
                    <th scope="col" className="px-4 py-3 text-right">Your payout</th>
                    <th scope="col" className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sales.map((sale, index) => (
                    <tr key={`${sale.orderReference}-${sale.productTitle}-${index}`} className="hover:bg-canvas/60">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-700">
                        {sale.orderReference}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 font-medium text-ink-900">
                        {sale.productTitle}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700">{sale.quantity}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{formatEuro(sale.unitPriceCents)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-900">
                        {formatEuro(sale.payoutCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-500">{formatDate(sale.soldAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableShell>
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'brand'
}) {
  return (
    <Card className={`p-5 ${tone === 'brand' ? 'border-white/25 bg-white/10/60' : ''}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-2 font-display text-2xl font-extrabold ${tone === 'brand' ? 'text-accent-500' : 'text-ink-900'}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  )
}

export { MerchantOverview }
