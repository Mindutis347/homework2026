import { useState } from 'react'

import { orderApi } from '@/api/endpoints'
import type { Order, OrderItem } from '@/api/types'
import { Badge, Button, ErrorNote } from '@/components/ui'

/**
 * Key disclosure panel. The code is deliberately absent from every page payload:
 * it only arrives when the buyer presses "Display key", so it cannot be read out
 * of devtools, a cached response or a prefetched request. Displaying stamps the
 * line with a timestamp, and from that moment a refund is no longer allowed.
 */
export function KeyPanel({
  orderId,
  item,
  onOrderChange,
}: {
  orderId: number
  item: OrderItem
  onOrderChange: (order: Order) => void
}) {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [displayedAt, setDisplayedAt] = useState<string | null>(item.displayedAt)
  const [busy, setBusy] = useState<'reveal' | 'refund' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const keyCount = item.keys.length

  async function reveal() {
    setBusy('reveal')
    setError(null)
    try {
      const result = await orderApi.revealKeys(orderId, item.id)
      setCodes(result.keys)
      setDisplayedAt(result.displayedAt)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not display the key')
    } finally {
      setBusy(null)
    }
  }

  async function refund() {
    const confirmed = window.confirm(
      'Refund this purchase? The key is returned to the seller and cannot be recovered afterwards.',
    )
    if (!confirmed) return
    setBusy('refund')
    setError(null)
    try {
      const { order } = await orderApi.refundItem(orderId, item.id)
      setCodes(null)
      onOrderChange(order)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not refund this purchase')
    } finally {
      setBusy(null)
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  if (item.refunded) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="danger">refunded</Badge>
        <span className="text-xs text-ink-500">
          This line was refunded before the key was displayed. The code was returned to the seller.
        </span>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {codes ? (
        <div className="flex flex-wrap items-center gap-2">
          {codes.map((key) => (
            <button
              key={key}
              onClick={() => void copyKey(key)}
              title="Copy key"
              className="rounded-[2px] bg-canvas px-3 py-1.5 font-mono text-sm tracking-widest text-ink-900 hover:bg-white/10"
            >
              {copied === key ? 'Copied!' : key}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={busy === 'reveal'} onClick={() => void reveal()}>
            {displayedAt ? 'Show key again' : 'Display key'}
          </Button>
          {!displayedAt && item.refundable && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'refund'}
              disabled={busy !== null}
              onClick={() => void refund()}
            >
              Refund key
            </Button>
          )}
          <span className="text-xs text-ink-500">
            {displayedAt
              ? `Displayed ${new Date(displayedAt).toLocaleString()} · refund no longer available`
              : `${keyCount} key${keyCount === 1 ? '' : 's'} waiting · hidden until you ask for ${keyCount === 1 ? 'it' : 'them'}`}
          </span>
        </div>
      )}

      {codes && displayedAt && (
        <p className="text-xs text-ink-500">
          Displayed {new Date(displayedAt).toLocaleString()} · this purchase can no longer be refunded
        </p>
      )}

      {error && <ErrorNote message={error} />}
    </div>
  )
}
