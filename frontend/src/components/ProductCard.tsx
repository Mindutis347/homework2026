import { Link } from 'react-router-dom'

import type { ProductCard as ProductCardType } from '@/api/types'
import { discountPercent, formatMoney } from '@/lib/format'

/** Grid card used on the homepage carousels, the store and search results. */
export function ProductCard({ product, eager = false }: { product: ProductCardType; eager?: boolean }) {
  const discount = discountPercent(product.minPriceCents, product.maxPriceCents)
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-raised"
    >
      {product.bestDiscountPercent > 0 && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-ink-900">
          -{product.bestDiscountPercent}%
        </span>
      )}
      <div className="aspect-[3/4] overflow-hidden bg-canvas">
        <img
          src={product.coverUrl}
          alt={product.title}
          loading={eager ? 'eager' : 'lazy'}
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
          {product.title}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="font-display text-base font-bold text-brand-700">
            {formatMoney(product.minPriceCents)}
          </span>
          {discount !== null && (
            <span className="text-xs text-ink-300 line-through">{formatMoney(product.maxPriceCents)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[0.7rem] text-ink-500">
          <span className="truncate">{product.platforms.map(platformLabel).join(' · ')}</span>
          {product.offerCount > 1 && <span className="ml-auto shrink-0">{product.offerCount} offers</span>}
        </div>
      </div>
    </Link>
  )
}

export function ProductGrid({ products }: { products: ProductCardType[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

export function platformLabel(slug: string): string {
  const labels: Record<string, string> = {
    steam: 'Steam',
    playstation: 'PlayStation',
    xbox: 'Xbox',
    nintendo: 'Switch',
    epic: 'Epic',
    gog: 'GOG',
  }
  return labels[slug] ?? slug
}
