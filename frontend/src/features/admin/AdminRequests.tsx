import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { ProductRequest } from '@/api/types'
import { Badge, Button, Card, EmptyState, ErrorNote, SectionHeading, Skeleton } from '@/components/ui'
import { formatDate } from '@/lib/format'

type StatusFilter = '' | 'pending' | 'approved' | 'rejected'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_TONE: Record<ProductRequest['status'], 'accent' | 'success' | 'danger'> = {
  pending: 'accent',
  approved: 'success',
  rejected: 'danger',
}

const textareaClass =
  'w-full rounded-[2px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200'

/** Merchant catalogue submissions. Approving one creates the catalog product,
 *  which is why the consequence is spelled out above the buttons. */
export default function AdminRequests() {
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .requests(status)
      .then(({ requests: fetched }) => {
        if (cancelled) return
        setRequests(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load catalog requests')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, reloadToken])

  async function review(id: number, approve: boolean) {
    setBusyId(id)
    setError(null)
    try {
      await adminApi.reviewRequest(id, approve, notes[id] ?? '')
      setNotes((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setReloadToken((token) => token + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not review that request')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <SectionHeading
        title="Catalog requests"
        subtitle="Requests for games that are not in the catalogue yet."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`rounded-[2px] px-3 py-1.5 text-xs font-bold transition ${
              status === filter.value
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-700 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          title="Nothing in this queue"
          description="Requests from merchants appear here for review."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const pending = request.status === 'pending'
            return (
              <Card key={request.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap gap-4">
                  {request.coverUrl ? (
                    <img
                      src={request.coverUrl}
                      alt=""
                      className="h-28 w-21 shrink-0 rounded-[2px] object-cover"
                    />
                  ) : (
                    <div className="grid h-28 w-21 shrink-0 place-items-center rounded-[2px] bg-canvas text-xs text-ink-300">
                      No cover
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-ink-900">{request.title}</h3>
                      <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {request.merchantName} · {request.platformSlug} · {request.regionCode} ·
                      submitted {formatDate(request.createdAt)}
                      {request.reviewedAt ? ` · reviewed ${formatDate(request.reviewedAt)}` : ''}
                    </p>
                    <p className="mt-2 text-sm text-ink-700">{request.description}</p>

                    {request.adminNote && (
                      <p className="mt-2 rounded-[2px] bg-canvas px-3 py-2 text-xs text-ink-700">
                        <span className="font-semibold text-ink-900">Admin note:</span>{' '}
                        {request.adminNote}
                      </p>
                    )}
                    {request.productSlug && (
                      <p className="mt-2 text-xs font-semibold text-brand-700">
                        Catalog product: /products/{request.productSlug}
                      </p>
                    )}

                    {pending && (
                      <div className="mt-3 space-y-2 border-t border-line pt-3">
                        <p className="text-xs text-ink-500">
                          Approving creates the catalog product from these details. Rejecting keeps it
                          out of the catalogue.
                        </p>
                        <textarea
                          rows={2}
                          value={notes[request.id] ?? ''}
                          onChange={(event) =>
                            setNotes((prev) => ({ ...prev, [request.id]: event.target.value }))
                          }
                          placeholder="Optional note for the merchant"
                          aria-label={`Review note for ${request.title}`}
                          className={textareaClass}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            loading={busyId === request.id}
                            disabled={busyId === request.id}
                            onClick={() => void review(request.id, true)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busyId === request.id}
                            onClick={() => void review(request.id, false)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { AdminRequests }
