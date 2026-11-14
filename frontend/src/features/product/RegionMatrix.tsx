import type { Offer } from '@/api/types'
import { formatMoney } from '@/lib/format'

/**
 * Cheapest in-stock price per region and platform. Every row on this page is a
 * single offer; this grid answers the next question a key buyer has — "is it
 * cheaper in another region?" — from data we already load, with no extra query.
 * Clicking a cell filters the offer list instead of navigating away.
 */
export function RegionMatrix({
  offers,
  onPick,
}: {
  offers: Offer[]
  onPick: (regionCode: string, platformSlug: string) => void
}) {
  const inStock = offers.filter((offer) => offer.stock > 0)
  const regions = [...new Set(inStock.map((offer) => offer.regionCode))]
  const platforms = [...new Set(inStock.map((offer) => offer.platformSlug))]
  if (regions.length < 2 || platforms.length < 2) return null

  // Cheapest price per region+platform cell.
  const cheapest = new Map<string, Offer>()
  for (const offer of inStock) {
    const key = `${offer.regionCode}|${offer.platformSlug}`
    const current = cheapest.get(key)
    if (!current || offer.priceCents < current.priceCents) cheapest.set(key, offer)
  }
  const bestOverall = Math.min(...inStock.map((offer) => offer.priceCents))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="label-caps pb-2 pr-3 text-left text-brand-300">Region</th>
            {platforms.map((platform) => (
              <th key={platform} className="label-caps pb-2 px-2 text-right text-brand-300">
                {platform}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => (
            <tr key={region} className="border-t border-white/10">
              <th scope="row" className="py-2 pr-3 text-left font-semibold text-white">{region}</th>
              {platforms.map((platform) => {
                const offer = cheapest.get(`${region}|${platform}`)
                return (
                  <td key={platform} className="px-2 py-2 text-right">
                    {offer ? (
                      <button
                        type="button"
                        onClick={() => onPick(region, platform)}
                        className={`rounded-[2px] px-1.5 py-0.5 font-semibold transition hover:bg-white/10 ${
                          offer.priceCents === bestOverall ? 'text-accent-500' : 'text-white'
                        }`}
                        title={`${offer.seller.storeName} · ${offer.stock} in stock`}
                      >
                        {formatMoney(offer.priceCents)}
                      </button>
                    ) : (
                      <span className="text-brand-300">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-brand-200">
        Cheapest price per region and platform, in stock only. Click a price to filter the offers below.
      </p>
    </div>
  )
}
