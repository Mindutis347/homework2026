import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { CURRENCIES, setActiveCurrency } from '@/lib/currency'
import { REGION_CODES } from '@/lib/region'
import type { RegionCode } from '@/lib/region'
import type { CurrencyCode } from '@/lib/currency'

/**
 * The visitor's market: which region's keys they can activate, and how prices are
 * printed. It is a preference, not a filter — every catalogue request carries it,
 * and the API prices a card from the visitor's region or a global key, whichever
 * is cheaper, falling back to global when the region has nothing to sell.
 */

type MarketState = {
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
  region: RegionCode
  setRegion: (code: RegionCode) => void
}

const REGION_KEY = 'keyforge.region'
const CURRENCY_KEY = 'keyforge.currency'

const MarketContext = createContext<MarketState | null>(null)

function readStored<T extends string>(key: string, allowed: readonly string[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored && allowed.includes(stored)) return stored as T
  } catch {
    // Private mode: fall back to the default market.
  }
  return fallback
}

/**
 * Holds market state. `formatMoney` and the catalogue client read module-level
 * values, so the provider writes them before children render — hence the
 * assignment during render rather than in an effect, which would flash the
 * previous currency. Changing either value remounts the tree beneath it, which is
 * how every price and every request picks up the new market at once.
 */
export function MarketProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(
    () => readStored(CURRENCY_KEY, CURRENCIES, 'EUR'),
  )
  const [region, setRegionState] = useState<RegionCode>(
    () => readStored(REGION_KEY, REGION_CODES, 'EU'),
  )
  setActiveCurrency(currency)

  useEffect(() => {
    try {
      localStorage.setItem(CURRENCY_KEY, currency)
      localStorage.setItem(REGION_KEY, region)
    } catch {
      // Remembering the choice is a nicety, not a requirement.
    }
  }, [currency, region])

  const value = useMemo<MarketState>(
    () => ({
      currency,
      setCurrency: setCurrencyState,
      region,
      setRegion: setRegionState,
    }),
    [currency, region],
  )

  return (
    <MarketContext.Provider value={value}>
      <div key={`${currency}-${region}`} className="contents">
        {children}
      </div>
    </MarketContext.Provider>
  )
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket must be used inside MarketProvider')
  return ctx
}
