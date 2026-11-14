import { useEffect, useState } from 'react'

import { catalogApi } from '@/api/endpoints'
import { useMarket } from '@/features/market/MarketContext'
import type { HomepageBlock } from '@/api/types'
import { Card, Skeleton } from '@/components/ui'
import { HomeBlock } from '@/features/home/blocks'

/** The landing page renders whatever blocks the API returns, in order. No block
 *  content, heading or pricing lives here; the block renderers live in ./blocks so
 *  the admin preview can reuse them. */
export default function HomePage() {
  const { region } = useMarket()
  const [blocks, setBlocks] = useState<HomepageBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    catalogApi
      .homepage(region)
      .then(({ blocks: fetched }) => {
        if (!cancelled) setBlocks(fetched)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the homepage')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [region])

  if (loading) {
    return (
      <div>
        <Skeleton className="h-[420px] w-full rounded-none" />
        <div className="container-page mt-10">
          <Skeleton className="h-8 w-56" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-page py-8 sm:py-16">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-extrabold text-white">The catalogue is unavailable</h1>
          <p className="mt-2 text-sm text-ink-500">{error}</p>
        </Card>
      </div>
    )
  }

  return <div className="pb-4">{blocks.map((block) => <HomeBlock key={block.id} block={block} />)}</div>
}
