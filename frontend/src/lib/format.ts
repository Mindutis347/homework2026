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
