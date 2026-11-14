import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Offer, ProductDetail } from '@/api/types'
import { ContentTypeBadge } from '@/components/ContentTypeBadge'
import { RichText } from '@/components/RichText'
import { ProductCard } from '@/components/ProductCard'
import { useToast } from '@/components/Toast'
import { Badge, Button, Card, EmptyState, SectionHeading, Skeleton } from '@/components/ui'
import { useCart } from '@/features/cart/CartContext'
import { ClampedText } from '@/features/product/ClampedText'
import { FactsStrip } from '@/features/product/FactsStrip'
import { MediaGallery } from '@/features/product/MediaGallery'
import { OfferRow } from '@/features/product/OfferRow'
import { PriceSummary } from '@/features/product/PriceSummary'
import { ProductTabs } from '@/features/product/ProductTabs'
import { RegionMatrix } from '@/features/product/RegionMatrix'
import { StickyBuyBar } from '@/features/product/StickyBuyBar'
import { formatDate, formatMoney, isPreorder } from '@/lib/format'

/**
 * The product page: one game, every competing seller offer, compare and buy.
 *
 * Order of the page is deliberate. Artwork, title, the four buying facts and the
 * cheapest price come first, because that is the decision; the description is
 * clamped so five offers are never pushed below a wall of marketing copy; the
 * offer list, a region price grid and the specification follow.
 */
export default function ProductPage() {
  const { slug = '' } = useParams()
  const { add } = useCart()
  const { notify } = useToast()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sort, setSort] = useState<'price' | 'rating'>('price')
  const [busyOffer, setBusyOffer] = useState<number | null>(null)
  const [tax, setTax] = useState<{ applyOnPurchase: boolean; purchaseTaxBasisPoints: number } | null>(null)
  const buyBarSentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    catalogApi.meta().then((meta) => setTax(meta.tax)).catch(() => undefined)
  }, [])

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

  const inStock = useMemo(
    () => (product ? product.offers.filter((offer) => offer.stock > 0) : []),
    [product],
  )

  // Sorting keeps sold-out rows at the bottom: the API already orders that way,
  // and re-sorting here must not undo it.
  const offers = useMemo(() => {
    if (!product) return []
    let list = product.offers
    if (platformFilter) list = list.filter((o) => o.platformSlug === platformFilter)
    if (regionFilter) list = list.filter((o) => o.regionCode === regionFilter)
    return [...list].sort((a, b) => {
      if ((a.stock === 0) !== (b.stock === 0)) return a.stock === 0 ? 1 : -1
      return sort === 'price' ? a.priceCents - b.priceCents : b.seller.rating - a.seller.rating
    })
  }, [product, platformFilter, regionFilter, sort])

  const cheapest = inStock[0] ?? null

  async function handleAdd(offer: Offer) {
    // Guests can fill a cart too; the sign-in prompt belongs at checkout.
    setBusyOffer(offer.id)
    try {
      await add(offer.id, 1)
      notify(`Added ${product?.title} from ${offer.seller.storeName} to your cart.`, {
        tone: 'success',
        action: { label: 'View cart', to: '/cart' },
      })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add to cart', { tone: 'danger' })
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
  const sellerCount = new Set(product.offers.map((o) => o.seller.id)).size
  const preorder = isPreorder(product.releaseDate)
  const deliveryModes = new Set(product.offers.map((o) => o.delivery))

  return (
    // The sticky buy bar floats over the page, so the page keeps room for it.
    <div className="pb-24 lg:pb-10">
      <div className="relative isolate -mt-8 overflow-hidden border-b border-white/10">
        {product.heroUrl && (
          <img
            src={product.heroUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 size-full object-cover opacity-25"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-brand-600 via-brand-600/90 to-brand-600/70"
        />

        <div className="container-page py-5 lg:py-8">
          <nav className="mb-3 flex items-center gap-2 text-xs text-brand-200 lg:mb-5">
            <Link to="/" className="hover:text-accent-500">Home</Link>
            <span aria-hidden>/</span>
            <Link to="/store" className="hover:text-accent-500">Store</Link>
            <span aria-hidden>/</span>
            <span className="truncate font-semibold text-white">{product.title}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
            <div>
              <MediaGallery
                coverUrl={product.coverUrl}
                heroUrl={product.heroUrl}
                title={product.title}
                eager
              />
            </div>

            <div>
              <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                {preorder && <span className="mr-2 text-accent-500">Pre-order</span>}
                {product.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ContentTypeBadge type={product.contentType} />
                {preorder && <Badge tone="accent">Pre-order</Badge>}
                {product.genres.map((genre) => (
                  <Badge key={genre} tone="neutral">{genre}</Badge>
                ))}
              </div>

              <FactsStrip
                regionCode={cheapest?.regionCode ?? regions[0] ?? 'GLOBAL'}
                regionName={
                  (cheapest?.regionCode ?? regions[0]) === 'GLOBAL'
                    ? 'Global'
                    : cheapest?.regionName ?? regions[0] ?? 'Global'
                }
                platforms={platforms}
                delivery={deliveryModes.has('instant') ? 'instant' : 'manual'}
              />

              <div ref={buyBarSentinel}>
                <PriceSummary
                  offers={product.offers}
                  releaseDate={product.releaseDate}
                  busy={busyOffer === cheapest?.id}
                  onAdd={(offer) => void handleAdd(offer)}
                />
              </div>

              {tax && tax.applyOnPurchase && tax.purchaseTaxBasisPoints > 0 && (
                <p className="mt-2 max-w-2xl text-xs text-brand-200">
                  Card payments add {tax.purchaseTaxBasisPoints / 100}% tax at checkout — paying from
                  your shop wallet adds none.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container-page pt-6">
        <ProductTabs offerCount={product.offers.length} />

        <section id="overview" className="scroll-mt-32">
          <SectionHeading
            title="About this game"
            subtitle={
              product.contentType === 'dlc'
                ? 'Add-on content — the base game is required to play.'
                : product.contentType === 'both'
                  ? 'Includes the base game and its add-on content.'
                  : undefined
            }
          />
          <div className="mt-3 max-w-3xl text-sm text-brand-100">
            {product.description ? (
              <ClampedText>
                <RichText text={product.description} />
              </ClampedText>
            ) : (
              <p className="text-brand-200">No description has been written for this title yet.</p>
            )}
          </div>
        </section>

        <section id="offers" className="mt-10 scroll-mt-32">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-extrabold text-white">
              {product.offers.length} offer{product.offers.length === 1 ? '' : 's'} from verified sellers
            </h2>
            <div className="ml-auto">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as 'price' | 'rating')}
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
            {platforms.map((platform) => (
              <Chip key={platform} active={platformFilter === platform} onClick={() => setPlatformFilter(platform)}>
                {platform === 'steam' ? 'Steam' : platform === 'nintendo' ? 'Switch' : platform}
              </Chip>
            ))}
            <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
            <Chip active={!regionFilter} onClick={() => setRegionFilter('')}>All regions</Chip>
            {regions.map((region) => (
              <Chip key={region} active={regionFilter === region} onClick={() => setRegionFilter(region)}>
                {region}
              </Chip>
            ))}
          </div>

          <div className="space-y-2">
            {offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                best={offer.id === cheapest?.id}
                busy={busyOffer === offer.id}
                onAdd={(picked) => void handleAdd(picked)}
              />
            ))}
            {offers.length === 0 && (
              <EmptyState
                title="No offers for that combination"
                description="That platform and region have no sellers right now."
                action={(
                  <Button
                    variant="onDark"
                    onClick={() => {
                      setPlatformFilter('')
                      setRegionFilter('')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              />
            )}
          </div>

          <Card className="mt-6 hidden p-4 lg:block">
            <h3 className="mb-3 font-display text-base font-extrabold text-white">Cheapest by region</h3>
            <RegionMatrix
              offers={product.offers}
              onPick={(region, platform) => {
                setRegionFilter(region)
                setPlatformFilter(platform)
                document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            />
          </Card>
        </section>

        <section id="details" className="mt-10 scroll-mt-32">
          <SectionHeading title="Details" subtitle="What the seller is shipping and how to activate it." />
          <Card className="mt-3 grid gap-x-8 gap-y-2 p-5 text-sm sm:grid-cols-2">
            <Detail
              label="Includes"
              value={
                product.contentType === 'dlc'
                  ? 'Add-on (needs the base game)'
                  : product.contentType === 'both'
                    ? 'Base game + DLC'
                    : 'Full game'
              }
            />
            <Detail label="Developer" value={product.developer || '—'} />
            <Detail label="Publisher" value={product.publisher || '—'} />
            <Detail label="Released" value={formatDate(product.releaseDate)} />
            <Detail label="Sellers" value={String(sellerCount)} />
            <Detail label="Offers" value={String(product.offers.length)} />
            <Detail label="Genres" value={product.genres.join(', ') || '—'} />
            <Detail label="Lowest price" value={cheapest ? formatMoney(cheapest.priceCents) : '—'} />
            <Detail label="Activation" value="Redeem the code on the platform shown above" />
            <Detail
              label="Refunds"
              value="Open until you press Display on a key in your library"
            />
          </Card>
          <p className="mt-3 text-xs text-brand-200">
            Something wrong with this listing?{' '}
            <Link to="/account/support" className="font-bold text-accent-500 hover:underline">
              Contact support
            </Link>{' '}
            and pick the order it belongs to.
          </p>
        </section>

        {product.related.length > 0 && (
          <section className="mt-12">
            <SectionHeading
              title="You might also like"
              subtitle={
                product.genres.length > 0
                  ? `More games tagged ${product.genres.slice(0, 3).join(', ')}`
                  : 'Popular picks from the catalogue'
              }
              action={
                <Link
                  to={`/store${product.genres.length > 0 ? `?genre=${encodeURIComponent(product.genres[0])}` : ''}`}
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

      {cheapest && (
        <StickyBuyBar
          sentinel={buyBarSentinel}
          offer={cheapest}
          preorder={preorder}
          busy={busyOffer === cheapest.id}
          onAdd={() => void handleAdd(cheapest)}
        />
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/10 py-1.5 last:border-0">
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
