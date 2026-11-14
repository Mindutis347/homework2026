import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { Ticket } from '@/api/types'
import { Badge, Card, EmptyState, ErrorNote, SectionHeading, Select, Skeleton } from '@/components/ui'
import { formatDate } from '@/lib/format'

type StatusFilter = '' | 'open' | 'in_progress' | 'resolved'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
]

const STATUSES: Ticket['status'][] = ['open', 'in_progress', 'resolved']

const STATUS_TONE: Record<Ticket['status'], 'accent' | 'brand' | 'success'> = {
  open: 'accent',
  in_progress: 'brand',
  resolved: 'success',
}

/** Support inbox: status triage plus the full ticket body on demand. */
export default function AdminTickets() {
  const [status, setStatus] = useState<StatusFilter>('open')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .tickets(status)
      .then(({ tickets: fetched }) => {
        if (cancelled) return
        setTickets(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load tickets')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, reloadToken])

  async function changeStatus(ticketId: number, next: string) {
    setBusyId(ticketId)
    setError(null)
    try {
      await adminApi.setTicketStatus(ticketId, next)
      setReloadToken((token) => token + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update that ticket')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <SectionHeading title="Support" subtitle="Customer tickets, refund flags and order lookups." />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={`rounded-[2px] px-3 py-1.5 text-xs font-bold transition ${
              status === filter.value
                ? 'bg-brand-600 text-white'
                : 'bg-canvas text-ink-700 hover:bg-white/10 hover:text-accent-500'
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
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState title="No tickets in this view" description="Nothing needs attention here right now." />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold text-ink-900">{ticket.subject}</h3>
                    <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                    {ticket.refundRequested && <Badge tone="danger">refund requested</Badge>}
                    <Badge tone="neutral">{ticket.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {ticket.userEmail}
                    {ticket.orderReference ? ` · order ${ticket.orderReference}` : ' · no order linked'} ·
                    opened {formatDate(ticket.createdAt)}
                  </p>
                </div>

                <div className="w-full sm:w-44">
                  <Select
                    value={ticket.status}
                    aria-label={`Status for ticket ${ticket.id}`}
                    disabled={busyId === ticket.id}
                    onChange={(event) => void changeStatus(ticket.id, event.target.value)}
                  >
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value.replace('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-accent-500">
                  Show message
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{ticket.body}</p>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export { AdminTickets }
