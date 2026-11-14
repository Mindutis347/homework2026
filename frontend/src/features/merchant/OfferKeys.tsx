import { useEffect, useState } from 'react'

import { merchantApi } from '@/api/endpoints'
import type { MerchantKey, MerchantOffer } from '@/api/types'
import { Badge, Button, EmptyState, ErrorNote, Notice, Skeleton } from '@/components/ui'
import { formatDate } from '@/lib/format'

type Filter = '' | 'available' | 'sold'

const FILTERS: { value: Filter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'available', label: 'In stock' },
  { value: 'sold', label: 'Sold' },
]

/** The keys behind one offer: what is still in stock, what has sold to whom, and
 *  a way to clear out batches of unsold codes. */
export function OfferKeys({ offer, onOffers }: { offer: MerchantOffer; onOffers: (offers: MerchantOffer[]) => void }) {
  const [filter, setFilter] = useState<Filter>('')
  const [keys, setKeys] = useState<MerchantKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSelected([])
    merchantApi
      .keys(offer.id, filter)
      .then(({ keys: fetched }) => {
        if (cancelled) return
        setKeys(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the keys')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [offer.id, filter])

  const available = keys.filter((key) => key.status === 'available')
  const allSelected = available.length > 0 && selected.length === available.length

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  async function removeSelected() {
    if (selected.length === 0) return
    const confirmed = window.confirm(
      `Remove ${selected.length} unsold key${selected.length === 1 ? '' : 's'}? Sold keys are never touched.`,
    )
    if (!confirmed) return
    setDeleting(true)
    setError(null)
    setNotice(null)
    try {
      const { deleted, offers } = await merchantApi.deleteKeys(offer.id, selected)
      onOffers(offers)
      const { keys: refreshed } = await merchantApi.keys(offer.id, filter)
      setKeys(refreshed)
      setSelected([])
      setNotice(`Removed ${deleted} unsold key${deleted === 1 ? '' : 's'}. Stock is now ${offer.availableKeys - deleted}.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove those keys')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-white">
          Keys for {offer.productTitle} · {offer.platformName} / {offer.regionCode}
        </p>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={`rounded-[2px] border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition ${
                filter === option.value
                  ? 'border-accent-500 bg-accent-500 text-on-accent'
                  : 'border-white/30 text-white hover:border-accent-500 hover:text-accent-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <ErrorNote message={error} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No keys here yet"
          description={
            filter === 'sold'
              ? 'Nothing has sold from this offer yet.'
              : 'Upload keys above and they appear here, ready to sell.'
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-100">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : available.map((key) => key.id))}
                className="size-4 accent-brand-500"
                disabled={available.length === 0}
              />
              Select all in stock ({available.length})
            </label>
            <span className="text-xs text-brand-200">{selected.length} selected</span>
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              loading={deleting}
              disabled={selected.length === 0}
              onClick={() => void removeSelected()}
            >
              Remove selected
            </Button>
          </div>

          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center gap-3 rounded-[2px] border border-line bg-canvas px-3 py-2"
              >
                {key.status === 'available' ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(key.id)}
                    onChange={() => toggle(key.id)}
                    aria-label={`Select key ${key.code}`}
                    className="size-4 accent-brand-500"
                  />
                ) : (
                  <span className="size-4" aria-hidden />
                )}
                <code className="font-mono text-sm tracking-widest text-white">{key.code}</code>
                <Badge tone={key.status === 'sold' ? 'neutral' : 'success'}>
                  {key.status === 'sold' ? 'sold' : 'in stock'}
                </Badge>
                <span className="text-xs text-brand-200">
                  {key.status === 'sold'
                    ? `${key.orderReference ? `order ${key.orderReference} · ` : ''}sold ${key.soldAt ? formatDate(key.soldAt) : ''}`
                    : `added ${formatDate(key.createdAt)}`}
                  {key.displayedAt ? ` · revealed by buyer ${formatDate(key.displayedAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
