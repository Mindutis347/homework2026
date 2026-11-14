import { Link } from 'react-router-dom'

import type { ProductCard as ProductCardType } from '@/api/types'
import { ContentTypeTag } from '@/components/ContentTypeBadge'
import { Cover } from '@/components/Cover'
import { discountPercent, formatMoney, isPreorder } from '@/lib/format'

/** Grid card used on the homepage rows, the store and search results. Dark navy
 *  tile with a yellow action bar, following eneba.com's product tile. */
export function ProductCard({ product, eager = false }: { product: ProductCardType; eager?: boolean }) {
  const discount = discountPercent(product.minPriceCents, product.maxPriceCents)
  const preorder = isPreorder(product.releaseDate)
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
      <div className="relative aspect-[3/4] overflow-hidden bg-brand-800">
        {preorder && (
          <span className="absolute bottom-1 left-1 z-10 rounded-[2px] bg-accent-500 px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-on-accent shadow-card">
            Pre-order
          </span>
        )}
        <Cover
          productId={product.id}
          url={product.coverUrl}
          alt={product.title}
          loading={eager ? 'eager' : 'lazy'}
          widths={[240, 320, 480]}
          fallbackWidth={320}
          sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 44vw"
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="label-caps truncate text-brand-200">{product.platforms.map(platformLabel).join(' · ')}</p>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:text-accent-300">
          {preorder && <span className="mr-1 text-accent-500">Pre-order</span>}
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
