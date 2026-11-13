import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { HomepageBlock } from '@/api/types'
import { ProductCard, platformLabel } from '@/components/ProductCard'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { formatMoney } from '@/lib/format'

/** The landing page renders whatever blocks the API returns, in order. No block
 *  content, heading or pricing lives in this file. */
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
      <div className="container-page space-y-10 py-8">
        <Skeleton className="h-72 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-page py-16">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-bold text-ink-900">The catalogue is unavailable</h1>
          <p className="mt-2 text-sm text-ink-500">{error}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="pb-16">
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  )
}

function BlockRenderer({ block }: { block: HomepageBlock }) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />
    case 'category_tiles':
      return <CategoryTilesBlock block={block} />
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
  const image = hero?.coverUrl ?? ''

  return (
    <section className="container-page mt-6">
      <div className="relative overflow-hidden rounded-2xl bg-brand-800 text-white">
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-40"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/95 via-brand-800/80 to-brand-600/40" />
        <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1.2fr_auto] lg:items-center">
          <div>
            {str(block.config, 'badge') && (
              <span className="inline-flex rounded-full bg-accent-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-900">
                {str(block.config, 'badge')}
              </span>
            )}
            <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
              {str(block.config, 'headline', block.title)}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-brand-100 sm:text-base">
              {str(block.config, 'subheadline', block.subtitle)}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={ctaHref}>
                <Button size="lg">{ctaLabel}</Button>
              </Link>
              {secondaryLabel && (
                <Link to={secondaryHref}>
                  <Button size="lg" variant="ghost" className="!text-white hover:!bg-white/10">
                    {secondaryLabel}
                  </Button>
                </Link>
              )}
            </div>
          </div>
          {hero && (
            <Link
              to={`/products/${hero.slug}`}
              className="hidden w-56 shrink-0 overflow-hidden rounded-xl border border-white/20 shadow-raised transition hover:scale-[1.02] lg:block"
            >
              <img src={hero.coverUrl} alt={hero.title} className="aspect-[3/4] w-full object-cover" />
              <div className="bg-brand-900/90 p-3">
                <p className="truncate text-sm font-semibold">{hero.title}</p>
                <p className="text-xs text-accent-500">{formatMoney(hero.minPriceCents)}</p>
              </div>
            </Link>
          )}
        </div>
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
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink-900 sm:text-2xl">
            {block.title}
            {tone === 'accent' && <Badge tone="accent">Hot</Badge>}
          </h2>
          {block.subtitle && <p className="mt-1 text-sm text-ink-500">{block.subtitle}</p>}
        </div>
        {href && (
          <Link to={href} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            View all →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {block.products.slice(0, 10).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

function CategoryTilesBlock({ block }: { block: HomepageBlock }) {
  const tiles = Array.isArray(block.config.tiles)
    ? (block.config.tiles as { label: string; href: string; platformSlug: string; count: number }[])
    : []

  return (
    <section className="container-page mt-10">
      <h2 className="mb-4 font-display text-xl font-bold text-ink-900 sm:text-2xl">{block.title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Link
            key={tile.platformSlug}
            to={tile.href}
            className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
          >
            <span className="font-display text-base font-bold text-ink-900 group-hover:text-brand-700">
              {tile.label}
            </span>
            <span className="mt-6 text-xs text-ink-500">{tile.count} games</span>
            <span className="mt-1 text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
              Browse {platformLabel(tile.platformSlug)} →
            </span>
          </Link>
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
      <div className="rounded-card border border-line bg-brand-50 p-6 sm:p-8">
        <h2 className="font-display text-lg font-bold text-brand-800">{block.title}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-xl bg-surface p-4 shadow-card">
              <p className="text-sm font-semibold text-ink-900">{item.title}</p>
              <p className="mt-1 text-sm text-ink-500">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
