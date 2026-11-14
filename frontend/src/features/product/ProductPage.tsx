import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Offer, ProductDetail } from '@/api/types'
import { ContentTypeBadge } from '@/components/ContentTypeBadge'
import { RichText } from '@/components/RichText'
import { ProductCard } from '@/components/ProductCard'
import { SectionHeading } from '@/components/ui'
import { Badge, Button, Card, EmptyState, Notice, Skeleton } from '@/components/ui'
import { useCart } from '@/features/cart/CartContext'
import { formatDate, formatMoney, isPreorder } from '@/lib/format'

/** The product page: one game, every competing seller offer, compare and buy. */
export default function ProductPage() {
  const { slug = '' } = useParams()
  const { add } = useCart()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sort, setSort] = useState<'price' | 'rating'>('price')
  const [busyOffer, setBusyOffer] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    catalogApi
      .product(slug)
      .then((detail) => {
        if (!cancelled) {
          setProduct(detail)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Product not found')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const offers = useMemo(() => {
    if (!product) return []
    let list = product.offers
    if (platformFilter) list = list.filter((o) => o.platformSlug === platformFilter)
    if (regionFilter) list = list.filter((o) => o.regionCode === regionFilter)
    return [...list].sort((a, b) =>
      sort === 'price' ? a.priceCents - b.priceCents : b.seller.rating - a.seller.rating,
    )
  }, [product, platformFilter, regionFilter, sort])

  const bestPrice = useMemo(
    () => (product?.offers.length ? Math.min(...product.offers.map((o) => o.priceCents)) : 0),
    [product],
  )

  async function handleAdd(offer: Offer) {
    // Guests can fill a cart too; the sign-in prompt belongs at checkout.
    setBusyOffer(offer.id)
    setFeedback(null)
    try {
      await add(offer.id, 1)
      setFeedback(`Added ${product?.title} from ${offer.seller.storeName} to your cart.`)
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Could not add to cart')
    } finally {
      setBusyOffer(null)
    }
  }

  if (loading) {
    return (
      <div className="container-page grid gap-8 py-8 lg:grid-cols-[320px_1fr]">
        <Skeleton className="aspect-[3/4] w-full" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="We could not find that game"
          description={error ?? 'The product may have been removed from the catalogue.'}
          action={<Link to="/store"><Button>Back to the store</Button></Link>}
        />
      </div>
    )
  }

  const platforms = [...new Set(product.offers.map((o) => o.platformSlug))]
  const regions = [...new Set(product.offers.map((o) => o.regionCode))]

  return (
    <div className="container-page py-8">
      <nav className="mb-5 flex items-center gap-2 text-xs text-brand-200">
        <Link to="/" className="hover:text-accent-500">Home</Link>
        <span aria-hidden>/</span>
        <Link to="/store" className="hover:text-accent-500">Store</Link>
        <span aria-hidden>/</span>
        <span className="truncate font-semibold text-white">{product.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <div>
          <div className="overflow-hidden rounded-card border border-white/20 shadow-raised">
            <img src={product.coverUrl} alt={product.title} className="aspect-[3/4] w-full object-cover" />
          </div>
          <Card className="mt-4 space-y-2 p-4 text-sm">
            <Detail label="Includes" value={product.contentType === 'dlc' ? 'Add-on (needs the base game)' : product.contentType === 'both' ? 'Base game + DLC' : 'Full game'} />
            <Detail label="Developer" value={product.developer || '—'} />
            <Detail label="Publisher" value={product.publisher || '—'} />
            <Detail label="Released" value={formatDate(product.releaseDate)} />
            <Detail label="Sellers" value={String(new Set(product.offers.map((o) => o.seller.id)).size)} />
            <Detail label="Offers" value={String(product.offers.length)} />
          </Card>
        </div>

        <div>
          <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
            {isPreorder(product.releaseDate) && <span className="mr-2 text-accent-500">Pre-order</span>}
            {product.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ContentTypeBadge type={product.contentType} />
            {isPreorder(product.releaseDate) && <Badge tone="accent">Pre-order</Badge>}
            {platforms.map((p) => (
              <Badge key={p} tone="accent">{p === 'steam' ? 'Steam' : p === 'nintendo' ? 'Switch' : p}</Badge>
            ))}
            {product.genres.map((g) => (
              <Badge key={g} tone="neutral">{g}</Badge>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl font-extrabold text-accent-500">
              {formatMoney(product.minPriceCents)}
            </span>
            {product.maxPriceCents > product.minPriceCents && (
              <span className="text-sm text-brand-100">
                up to {formatMoney(product.maxPriceCents)} from other sellers
              </span>
            )}
            {product.bestDiscountPercent > 0 && (
              <Badge tone="accent">Save {product.bestDiscountPercent}%</Badge>
            )}
          </div>

          <div className="mt-5 max-w-2xl">
            <RichText text={product.description} />
          </div>

          {feedback && (
            <div className="mt-5"><Notice tone="success">{feedback}</Notice></div>
          )}

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-extrabold text-white">
                {offers.length} offer{offers.length === 1 ? '' : 's'} from verified sellers
              </h2>
              <div className="ml-auto flex gap-2">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'price' | 'rating')}
                  className="rounded-[2px] border border-line bg-surface px-2 py-1.5 text-xs font-bold text-white"
                  aria-label="Sort offers"
                >
                  <option value="price">Cheapest first</option>
                  <option value="rating">Best rated seller</option>
                </select>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              <Chip active={!platformFilter} onClick={() => setPlatformFilter('')}>All platforms</Chip>
              {platforms.map((p) => (
                <Chip key={p} active={platformFilter === p} onClick={() => setPlatformFilter(p)}>
                  {p === 'steam' ? 'Steam' : p === 'nintendo' ? 'Switch' : p}
                </Chip>
              ))}
              <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
              <Chip active={!regionFilter} onClick={() => setRegionFilter('')}>All regions</Chip>
              {regions.map((r) => (
                <Chip key={r} active={regionFilter === r} onClick={() => setRegionFilter(r)}>{r}</Chip>
              ))}
            </div>

            <div className="space-y-2">
              {offers.map((offer) => {
                const isBest = offer.priceCents === bestPrice
                return (
                  <Card
                    key={offer.id}
                    className={`flex flex-wrap items-center gap-4 p-4 ${isBest ? 'border-mint-500 ring-1 ring-mint-500/40' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{offer.seller.storeName}</span>
                        {isBest && <Badge tone="success">Best price</Badge>}
                        <Badge tone="neutral">{offer.platformName}</Badge>
                        <Badge tone="neutral">{offer.regionCode}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        ★ {offer.seller.rating.toFixed(1)} ({offer.seller.ratingCount.toLocaleString()}) ·{' '}
                        {offer.seller.salesCount.toLocaleString()} sales ·{' '}
                        {offer.delivery === 'instant' ? 'instant delivery' : 'manual delivery'} ·{' '}
                        {offer.stock} in stock
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl font-bold text-accent-500">
                        {formatMoney(offer.priceCents)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={busyOffer === offer.id}
                      onClick={() => handleAdd(offer)}
                    >
                      Add to cart
                    </Button>
                  </Card>
                )
              })}
              {offers.length === 0 && (
                <EmptyState title="No offers for that combination" description="Try another platform or region." />
              )}
            </div>
          </section>
        </div>
      </div>

      {product.related.length > 0 && (
        <section className="mt-12">
          <SectionHeading
            title="You might also like"
            subtitle={
              product.genres.length > 0
                ? `More games tagged ${product.genres.slice(0, 3).join(", ")}`
                : "Popular picks from the catalogue"
            }
            action={
              <Link
                to={`/store${product.genres.length > 0 ? `?genre=${encodeURIComponent(product.genres[0])}` : ""}`}
                className="rounded-[2px] border border-white/40 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition hover:border-accent-500 hover:text-accent-500"
              >
                Browse more
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {product.related.slice(0, 5).map((related) => (
              <ProductCard key={related.id} product={related} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[2px] border px-2.5 py-1 text-xs font-bold transition ${
        active
          ? 'border-accent-500 bg-accent-500 text-on-accent'
          : 'border-white/30 text-white hover:border-accent-500 hover:text-accent-500'
      }`}
    >
      {children}
    </button>
  )
}
