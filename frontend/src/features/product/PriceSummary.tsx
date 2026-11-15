import { Button } from '@/components/ui'
import type { Offer } from '@/api/types'
import { discountPercent, formatMoney } from '@/lib/format'
import { isPreorder } from '@/lib/format'

/**
 * The buy box: one price, one button. A marketplace page can drown in seller
 * rows, so the cheapest in-stock offer is always reachable here without scroll,
 * and the full list is one anchor away.
 *
 * It reads the offers the page is currently showing, so choosing a region or a
 * platform moves the headline price with it — a box that kept quoting a global
 * key while the list showed European ones was the confusing part.
 */
export function PriceSummary({
  offers,
  totalOffers,
  filterLabel,
  onClearFilters,
  releaseDate,
  busy,
  onAdd,
}: {
  offers: Offer[]
  totalOffers: number
  filterLabel?: string
  onClearFilters: () => void
  releaseDate: string | null
  busy: boolean
  onAdd: (offer: Offer) => void
}) {
  const inStock = offers.filter((offer) => offer.stock > 0)
  const cheapest = inStock[0]

  // Nothing matches the chips: say that, and offer the way back, instead of
  // claiming the game is sold out.
  if (!cheapest) {
    const noMatch = offers.length === 0 && totalOffers > 0
    return (
      <div className="mt-4 max-w-xl rounded-[2px] border border-white/20 bg-brand-800/60 p-4 lg:mt-5">
        <p className="font-display text-lg font-extrabold text-white">
          {noMatch ? 'No offers for that combination' : 'Sold out'}
        </p>
        <p className="mt-1 text-sm text-brand-200">
          {noMatch
            ? `${filterLabel} has no sellers right now — ${totalOffers} offer${totalOffers === 1 ? '' : 's'} exist in other regions or platforms.`
            : 'Every seller is out of stock right now. Check back, or browse similar games below.'}
        </p>
        {noMatch && (
          <Button variant="onDark" size="sm" className="mt-3" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    )
  }

  const base = cheapest.basePriceCents ?? null
  const discount = base ? discountPercent(cheapest.priceCents, base) : null
  const preorder = isPreorder(releaseDate)

  return (
    <div className="mt-4 max-w-xl rounded-[2px] border border-white/15 bg-brand-800/50 p-3.5 lg:mt-5 lg:p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-3xl font-extrabold text-accent-500">
          {formatMoney(cheapest.priceCents)}
        </span>
        {base && discount !== null && (
          <>
            <span className="text-sm text-brand-300 line-through">{formatMoney(base)}</span>
            <span className="rounded-[2px] bg-accent-500 px-1.5 py-0.5 text-[0.7rem] font-extrabold text-on-accent">
              −{discount}%
            </span>
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-brand-200">
        Cheapest of {inStock.length} offer{inStock.length === 1 ? '' : 's'} · {cheapest.seller.storeName} ·{' '}
        {cheapest.platformName} · {cheapest.regionCode}
        {filterLabel && ` — filtered to ${filterLabel}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="lg" loading={busy} onClick={() => onAdd(cheapest)}>
          {preorder ? 'Pre-order' : 'Add to cart'}
        </Button>
        <a
          href="#offers"
          className="rounded-[2px] border border-white/40 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white transition hover:border-accent-500 hover:text-accent-500"
        >
          Compare {offers.length} offers
        </a>
      </div>
    </div>
  )
}
