import { Link } from 'react-router-dom'

import type { ProductCard as ProductCardType } from '@/api/types'
import { ContentTypeTag } from '@/components/ContentTypeBadge'
import { discountPercent, formatMoney } from '@/lib/format'

/** Grid card used on the homepage rows, the store and search results. Dark navy
 *  tile with a yellow action bar, following eneba.com's product tile. */
export function ProductCard({ product, eager = false }: { product: ProductCardType; eager?: boolean }) {
  const discount = discountPercent(product.minPriceCents, product.maxPriceCents)
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-[2px] bg-brand-900 text-white transition hover:bg-brand-800"
    >
      {product.bestDiscountPercent > 0 && (
        <span className="absolute left-0 top-0 z-10 bg-accent-500 px-2 py-0.5 text-xs font-extrabold text-on-accent">
          -{product.bestDiscountPercent}%
        </span>
      )}
      <ContentTypeTag type={product.contentType} />
      <div className="aspect-[3/4] overflow-hidden bg-brand-800">
        <img
          src={product.coverUrl}
          alt={product.title}
          loading={eager ? 'eager' : 'lazy'}
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="label-caps truncate text-brand-200">{product.platforms.map(platformLabel).join(' · ')}</p>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:text-accent-300">
          {product.title}
        </h3>
        <div className="mt-auto flex items-baseline gap-1.5 pt-1.5">
          <span className="font-display text-base font-extrabold text-accent-500">
            {formatMoney(product.minPriceCents)}
          </span>
          {discount !== null && (
            <span className="text-[0.7rem] text-brand-300 line-through">{formatMoney(product.maxPriceCents)}</span>
          )}
        </div>
      </div>

      <span className="flex items-center justify-between bg-accent-500 px-3 py-2 text-[0.7rem] font-extrabold uppercase tracking-wide text-on-accent transition group-hover:bg-accent-400">
        View offers
        {product.offerCount > 1 && <span className="font-bold">{product.offerCount}</span>}
      </span>
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
