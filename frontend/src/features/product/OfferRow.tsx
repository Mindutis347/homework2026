import { Badge, Button, Card } from '@/components/ui'
import type { Offer } from '@/api/types'
import { discountPercent, formatMoney } from '@/lib/format'

/** One seller row. Sold-out rows stay visible and disabled rather than vanishing,
 *  because a price the buyer just saw should not disappear mid-scroll. */
export function OfferRow({
  offer,
  best,
  busy,
  onAdd,
}: {
  offer: Offer
  best: boolean
  busy: boolean
  onAdd: (offer: Offer) => void
}) {
  const soldOut = offer.stock === 0
  const base = offer.basePriceCents ?? null
  const discount = base ? discountPercent(offer.priceCents, base) : null
  const lowStock = !soldOut && offer.stock <= 3

  return (
    <Card
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${
        best ? 'border-mint-500 ring-1 ring-mint-500/40' : ''
      } ${soldOut ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{offer.seller.storeName}</span>
          {best && <Badge tone="success">Best price</Badge>}
          {soldOut && <Badge tone="danger">Sold out</Badge>}
          <Badge tone="neutral">{offer.platformName}</Badge>
          <Badge tone="neutral">{offer.regionCode}</Badge>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500">
          <span>★ {offer.seller.rating.toFixed(1)} ({offer.seller.ratingCount.toLocaleString()})</span>
          <span aria-hidden>·</span>
          <span>{offer.seller.salesCount.toLocaleString()} sales</span>
          <span aria-hidden>·</span>
          <span>{offer.delivery === 'instant' ? 'Instant delivery' : 'Manual delivery'}</span>
          <span aria-hidden>·</span>
          <span className={lowStock ? 'font-bold text-accent-300' : ''}>
            {soldOut ? 'No stock' : lowStock ? `Only ${offer.stock} left` : `${offer.stock} in stock`}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-display text-xl font-bold text-accent-500">{formatMoney(offer.priceCents)}</p>
          {base && discount !== null && (
            <p className="text-xs text-brand-300">
              <span className="line-through">{formatMoney(base)}</span>
              <span className="ml-1.5 font-bold text-mint-400">−{discount}%</span>
            </p>
          )}
        </div>
        <Button size="sm" loading={busy} disabled={soldOut} onClick={() => onAdd(offer)}>
          {soldOut ? 'Sold out' : 'Add to cart'}
        </Button>
      </div>
    </Card>
  )
}
