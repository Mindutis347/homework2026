/**
 * Display currency. Every price is stored and charged in EUR cents — the backend
 * and the payment flow know nothing else — so a switch only changes how numbers
 * are printed. The rates are fixed demo rates; a real shop would fetch them and
 * price in the buyer's currency at checkout.
 */
export const CURRENCIES = ['EUR', 'USD', 'GBP'] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

export const RATES: Record<CurrencyCode, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.86,
}

const SYMBOLS: Record<CurrencyCode, string> = { EUR: '€', USD: '$', GBP: '£' }

let active: CurrencyCode = 'EUR'

export function activeCurrency(): CurrencyCode {
  return active
}

export function setActiveCurrency(code: CurrencyCode) {
  active = code
}

export function currencySymbol(code: CurrencyCode = active): string {
  return SYMBOLS[code]
}

export function convertCents(cents: number, code: CurrencyCode = active): number {
  return Math.round(cents * RATES[code])
}

/** A typed amount in the display currency, back to euro cents for the API. */
export function toEuroCents(amount: number, code: CurrencyCode = active): number {
  return Math.round((amount * 100) / RATES[code])
}

/** Euro cents as a plain amount string in the display currency, for form inputs. */
export function toDisplayAmount(cents: number, code: CurrencyCode = active): string {
  const amount = convertCents(cents, code) / 100
  return String(Number(amount.toFixed(2)))
}
