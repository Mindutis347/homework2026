import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { CURRENCIES, setActiveCurrency } from '@/lib/currency'
import type { CurrencyCode } from '@/lib/currency'

type CurrencyState = {
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
}

const STORAGE_KEY = 'keyforge.currency'

const CurrencyContext = createContext<CurrencyState | null>(null)

function readStored(): CurrencyCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (CURRENCIES as readonly string[]).includes(stored)) return stored as CurrencyCode
  } catch {
    // Private mode: fall back to euro.
  }
  return 'EUR'
}

/**
 * Holds the display currency. `formatMoney` reads the module-level value, so the
 * provider has to write it before children render — hence the assignment during
 * render rather than in an effect, which would flash the previous currency.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(readStored)
  setActiveCurrency(currency)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, currency)
    } catch {
      // Remembering the choice is a nicety, not a requirement.
    }
  }, [currency])

  const value = useMemo<CurrencyState>(() => ({ currency, setCurrency: setCurrencyState }), [currency])

  // Prices are printed by `formatMoney`, which reads a module-level value rather
  // than a prop, so a change has to re-render the tree beneath it. Remounting on
  // the currency key is deliberate: it is the only way to guarantee that no
  // component keeps an old number on screen, and unlike a page reload the user
  // stays where they were.
  return (
    <CurrencyContext.Provider value={value}>
      <div key={currency} className="contents">
        {children}
      </div>
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider')
  return ctx
}
