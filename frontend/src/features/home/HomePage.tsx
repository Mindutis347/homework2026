import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { HomepageBlock } from '@/api/types'
import { ProductCard, platformLabel } from '@/components/ProductCard'
import { Button, Card, Skeleton } from '@/components/ui'
import { formatMoney } from '@/lib/format'

/** The landing page renders whatever blocks the API returns, in order. No block
 *  content, heading or pricing lives in this file — only how each block type is
 *  presented in the Eneba layout: full-bleed hero, purple platform strip, then
 *  white slices of dark product tiles. */
export default function HomePage() {
  const [blocks, setBlocks] = useState<HomepageBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    catalogApi
      .homepage()
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
  }, [])

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
      <div className="container-page py-16">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-extrabold text-brand-900">The catalogue is unavailable</h1>
          <p className="mt-2 text-sm text-ink-500">{error}</p>
        </Card>
      </div>
    )
  }

  return <div className="pb-4">{blocks.map((block) => <BlockRenderer key={block.id} block={block} />)}</div>
}

function BlockRenderer({ block }: { block: HomepageBlock }) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />
    case 'category_tiles':
      return <PlatformStrip block={block} />
    case 'banner':
      return <BannerBlock block={block} />
    case 'product_carousel':
    case 'platform_strip':
    default:
      return <CarouselBlock block={block} />
  }
}

function str(config: Record<string, unknown>, key: string, fallback = ''): string {
  const value = config[key]
  return typeof value === 'string' ? value : fallback
}

function HeroBlock({ block }: { block: HomepageBlock }) {
  const hero = block.products[0]
  const ctaLabel = str(block.config, 'ctaLabel', 'Shop now')
  const ctaHref = str(block.config, 'ctaHref', '/store')
  const secondaryLabel = str(block.config, 'secondaryCtaLabel')
  const secondaryHref = str(block.config, 'secondaryCtaHref', '/store')

  return (
    <section className="relative isolate overflow-hidden bg-brand-700">
      {hero?.coverUrl && (
        <img
          src={hero.coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-55"
          loading="eager"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-800/85 to-brand-600/30" />

      <div className="container-page relative flex min-h-[360px] flex-col justify-center py-12 sm:min-h-[420px] sm:py-16">
        <div className="max-w-2xl">
          {str(block.config, 'badge') && (
            <span className="inline-flex rounded-[2px] bg-accent-500 px-2.5 py-1 label-caps text-ink-900">
              {str(block.config, 'badge')}
            </span>
          )}
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.05] text-white sm:text-4xl lg:text-[3.25rem]">
            {str(block.config, 'headline', block.title)}
          </h1>
          <p className="mt-3 max-w-xl text-sm font-medium text-brand-100 sm:text-base">
            {str(block.config, 'subheadline', block.subtitle)}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to={ctaHref}>
              <Button size="lg">{ctaLabel}</Button>
            </Link>
            {secondaryLabel && (
              <Link
                to={secondaryHref}
                className="rounded-[2px] border border-white/40 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white hover:border-accent-500 hover:text-accent-500"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
          {hero && (
            <Link
              to={`/products/${hero.slug}`}
              className="mt-6 inline-flex items-baseline gap-2 text-xs font-bold text-brand-200 hover:text-accent-500"
            >
              <span className="label-caps">Featured</span>
              {hero.title}
              <span className="font-extrabold text-accent-500">{formatMoney(hero.minPriceCents)}</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

/** Purple platform strip directly under the hero, like Eneba's category row. */
function PlatformStrip({ block }: { block: HomepageBlock }) {
  const tiles = Array.isArray(block.config.tiles)
    ? (block.config.tiles as { label: string; href: string; platformSlug: string; count: number }[])
    : []
  if (tiles.length === 0) return null

  return (
    <section className="bg-brand-600 text-white">
      <div className="container-page flex gap-1 overflow-x-auto py-3">
        {tiles.map((tile) => (
          <Link
            key={tile.platformSlug}
            to={tile.href}
            className="group flex min-w-24 flex-1 flex-col items-center gap-1.5 rounded-[2px] px-3 py-2.5 text-center transition hover:bg-brand-700"
          >
            <span className="grid size-9 place-items-center rounded-[2px] border border-white/30 text-xs font-extrabold uppercase text-white transition group-hover:border-accent-500 group-hover:text-accent-500">
              {platformLabel(tile.platformSlug).slice(0, 2)}
            </span>
            <span className="text-[0.8125rem] font-bold leading-tight">{tile.label}</span>
            <span className="text-[0.6875rem] font-semibold text-brand-200">{tile.count} games</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function CarouselBlock({ block }: { block: HomepageBlock }) {
  if (block.products.length === 0) return null
  const href = str(block.config, 'href')
  const tone = str(block.config, 'tone')

  return (
    <section className="container-page mt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white sm:text-[1.75rem]">
            {block.title}
            {tone === 'accent' && (
              <span className="rounded-[2px] bg-accent-500 px-2 py-0.5 label-caps text-ink-900">Hot</span>
            )}
          </h2>
          {block.subtitle && <p className="mt-1 text-sm text-brand-100">{block.subtitle}</p>}
        </div>
        {href && (
          <Link
            to={href}
            className="shrink-0 rounded-[2px] border border-white/40 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition hover:border-accent-500 hover:text-accent-500"
          >
            View all
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {block.products.slice(0, 5).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

function BannerBlock({ block }: { block: HomepageBlock }) {
  const items = Array.isArray(block.config.items)
    ? (block.config.items as { title: string; text: string }[])
    : []

  return (
    <section className="container-page mt-12">
      <div className="bg-brand-900 p-6 text-white sm:p-8">
        <h2 className="font-display text-xl font-extrabold sm:text-2xl">{block.title}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-[2px] bg-brand-800 p-4">
              <p className="text-sm font-extrabold text-accent-500">{item.title}</p>
              <p className="mt-1 text-sm text-brand-200">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
