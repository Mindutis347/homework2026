import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

import { Button } from '@/components/ui'
import type { Offer } from '@/api/types'
import { formatMoney } from '@/lib/format'

/**
 * Keeps the buy decision reachable while the page scrolls: always on a phone
 * (where the hero buy box is a screen away), and on desktop only once the hero
 * box has left the viewport — a second copy of a price that is already visible
 * would just be noise.
 */
export function StickyBuyBar({
  sentinel,
  offer,
  preorder,
  busy,
  onAdd,
}: {
  sentinel: RefObject<HTMLElement | null>
  offer: Offer
  preorder: boolean
  busy: boolean
  onAdd: () => void
}) {
  const [pastHero, setPastHero] = useState(false)

  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [sentinel])

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-brand-700/95 px-4 py-3 backdrop-blur ${
        pastHero ? 'block' : 'block lg:hidden'
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-brand-200">
            {offer.seller.storeName} · {offer.platformName} · {offer.regionCode}
          </p>
          <p className="font-display text-lg font-extrabold text-accent-500">{formatMoney(offer.priceCents)}</p>
        </div>
        <a
          href="#offers"
          className="hidden rounded-[2px] border border-white/40 px-3 py-2 text-[0.7rem] font-extrabold uppercase tracking-wide text-white sm:inline-block"
        >
          All offers
        </a>
        <Button size="sm" loading={busy} onClick={onAdd}>
          {preorder ? 'Pre-order' : 'Add to cart'}
        </Button>
      </div>
    </div>
  )
}
