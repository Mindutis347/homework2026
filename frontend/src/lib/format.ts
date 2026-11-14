import { activeCurrency, convertCents } from '@/lib/currency'
import type { CurrencyCode } from '@/lib/currency'

/**
 * Money is stored and transported as integer EUR cents; format at the edge only.
 * Without an explicit currency this prints in the currency the visitor picked,
 * converted with the demo rates in `lib/currency.ts`.
 */
export function formatMoney(cents: number, currency?: CurrencyCode): string {
  const code = currency ?? activeCurrency()
  const amount = currency ? cents : convertCents(cents, code)
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

/** Platform accounting (payouts, commissions, ledgers) is always in euro. */
export function formatEuro(cents: number): string {
  return formatMoney(cents, 'EUR')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function discountPercent(priceCents: number, baseCents: number): number | null {
  if (!baseCents || baseCents <= priceCents) return null
  return Math.round(((baseCents - priceCents) / baseCents) * 100)
}

/** Compare release dates by calendar day, in the viewer's timezone. */
export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** A title with a future release date is a pre-order; the day it ships, this
 *  turns false on its own — there is no flag to clear in the database. */
export function isPreorder(releaseDate: string | null | undefined): boolean {
  if (!releaseDate) return false
  return releaseDate.slice(0, 10) > todayISO()
}
