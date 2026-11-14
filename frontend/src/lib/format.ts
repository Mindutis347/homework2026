/** Money is stored and transported as integer cents; format at the edge only. */
export function formatMoney(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
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
