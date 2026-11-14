import { useEffect, useRef, useState } from 'react'

import { CURRENCIES } from '@/lib/currency'
import { useMarket } from '@/features/market/MarketContext'
import { REGIONS } from '@/lib/region'

/**
 * Region and currency picker, sitting next to the cart the way eneba puts its
 * "English EU · EUR" control. One button, one panel: the region decides which
 * keys are priced (yours or global, whichever is cheaper), the currency decides
 * how the number is printed.
 */
export function MarketMenu() {
  const { currency, setCurrency, region, setRegion } = useMarket()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = REGIONS.find((entry) => entry.code === region) ?? REGIONS[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Market: ${active.label}, prices in ${currency}`}
        className="flex h-10 items-center gap-1.5 rounded-[2px] border border-white/25 px-2.5 text-xs font-bold text-white transition hover:border-accent-500 hover:text-accent-500 sm:h-auto sm:py-1.5"
      >
        <span aria-hidden className="text-sm leading-none">{active.flag}</span>
        <span className="hidden sm:block">{region} · {currency}</span>
        <span aria-hidden className="text-[0.6rem] opacity-70">▾</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose market"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-lg border border-line bg-surface p-4 text-white shadow-raised sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-72 sm:overflow-visible sm:rounded-[2px] sm:p-3"
        >
          <p className="label-caps text-brand-300">Keys you can activate</p>
          <ul className="mt-2 space-y-1">
            {REGIONS.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  onClick={() => {
                    setRegion(entry.code)
                    setOpen(false)
                  }}
                  aria-pressed={entry.code === region}
                  className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-sm transition ${
                    entry.code === region
                      ? 'bg-accent-500 font-extrabold text-on-accent'
                      : 'text-brand-100 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span aria-hidden>{entry.flag}</span>
                  <span className="flex-1">{entry.label}</span>
                  <span className="text-xs opacity-70">{entry.code}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="label-caps mt-3 text-brand-300">Show prices in</p>
          <div className="mt-2 flex gap-1">
            {CURRENCIES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCurrency(code)}
                aria-pressed={code === currency}
                className={`flex-1 rounded-[2px] px-2 py-1.5 text-xs font-extrabold transition ${
                  code === currency
                    ? 'bg-accent-500 text-on-accent'
                    : 'border border-white/20 text-brand-100 hover:border-accent-500 hover:text-white'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.6875rem] leading-snug text-brand-300">
            Every price is charged in euro; other currencies are a fixed-rate display. Regional keys
            are shown next to global ones, and you pay whichever is cheaper.
          </p>
        </div>
      )}
    </div>
  )
}
