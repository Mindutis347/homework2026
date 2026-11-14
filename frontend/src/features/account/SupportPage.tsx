import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { orderApi, ticketApi } from '@/api/endpoints'
import type { Order, Ticket } from '@/api/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Notice,
  PageBand,
  SectionHeading,
  Select,
  Skeleton,
} from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { AttachmentField } from '@/features/support/AttachmentField'
import type { PendingAttachment } from '@/features/support/AttachmentField'
import { TicketThread } from '@/features/support/TicketThread'
import { formatDate, formatMoney } from '@/lib/format'

const CATEGORIES: { value: Ticket['category']; label: string }[] = [
  { value: 'delivery', label: 'Problem with a key or delivery' },
  { value: 'refund', label: 'Refund request' },
  { value: 'account', label: 'Account or sign-in' },
  { value: 'other', label: 'Something else' },
]

const STATUS_TONE: Record<Ticket['status'], 'accent' | 'brand' | 'success'> = {
  open: 'accent',
  in_progress: 'brand',
  resolved: 'success',
}

/** Customer support: file a ticket against an order and follow its status. */
export default function SupportPage() {
  const { user, loading: authLoading } = useAuth()
  const [params] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [openThread, setOpenThread] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [subject, setSubject] = useState(params.get('subject') ?? '')
  const [category, setCategory] = useState<Ticket['category']>(
    (params.get('category') as Ticket['category'] | null) ?? 'delivery',
  )
  const [orderId, setOrderId] = useState(params.get('orderId') ?? '')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<PendingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // Guests see the sign-in gate below; there is nothing to fetch for them.
    if (!user) return
    let cancelled = false
    Promise.all([orderApi.list(), ticketApi.list()])
      .then(([orderResult, ticketResult]) => {
        if (cancelled) return
        setOrders(orderResult.orders)
        setTickets(ticketResult.tickets)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load your support details')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSent(false)
    if (subject.trim().length < 3) {
      setFormError('Give your request a short subject (at least 3 characters).')
      return
    }
    if (message.trim().length < 5) {
      setFormError('Describe the problem in a sentence or two.')
      return
    }
    setFormError(null)
    setSending(true)
    try {
      await ticketApi.create({
        subject: subject.trim(),
        body: message.trim(),
        category,
        orderId: orderId === '' ? undefined : Number(orderId),
        attachments: files.map((file) => ({ mime: file.mime, data: file.data })),
      })
      setSubject('')
      setMessage('')
      setOrderId('')
      setFiles([])
      setSent(true)
      const { tickets: refreshed } = await ticketApi.list()
      setTickets(refreshed)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not send your request')
    } finally {
      setSending(false)
    }
  }

  if (authLoading) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Support" subtitle="Loading your orders…" />
        <div className="container-page space-y-3 py-8">
          {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div>
        <PageBand eyebrow="Your account" title="Support" subtitle="Sign in to contact support about an order." />
        <div className="container-page py-16">
          <EmptyState
            title="Sign in to contact support"
            description="Support tickets are tied to your account and its orders."
            action={<Link to="/sign-in?next=/account/support"><Button>Sign in</Button></Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageBand
        eyebrow="Your account"
        title="Support"
        subtitle="File a request against an order and follow its status here."
      >
        <Link
          to="/account/orders"
          className="mt-4 inline-block rounded-[2px] border border-white/40 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white hover:border-accent-500 hover:text-accent-500"
        >
          Back to your library
        </Link>
      </PageBand>

      <div className="container-page py-8">
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {!user.isVerified && (
        <div className="mb-6">
          <ErrorNote message="Verify your e-mail before sending a support request." />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeading title="Contact support" subtitle="We answer every request from the back-office queue." />

          <Card className="p-5">
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <Field label="Subject" hint="One line, e.g. 'Elden Ring key already used'.">
                <Input
                  value={subject}
                  maxLength={120}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="What is the problem?"
                />
              </Field>

              <Field label="Reason">
                <Select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Ticket['category'])}
                >
                  {CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Related order"
                hint={
                  loading
                    ? 'Loading your orders…'
                    : orders.length === 0
                      ? 'You have no orders yet — leave this empty for account questions.'
                      : 'Optional, but it helps us find your purchase faster.'
                }
              >
                <Select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                  <option value="">No specific order</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.reference} · {formatDate(order.createdAt)} · {formatMoney(order.totalCents)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Message" hint="Paste any error you saw; never include your full key.">
                <textarea
                  value={message}
                  rows={5}
                  maxLength={4000}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What happened, and what did you expect?"
                  className="w-full rounded-[2px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </Field>

              {category === 'refund' && (
                <p className="rounded-[2px] bg-canvas px-3.5 py-2.5 text-xs text-ink-700">
                  This will be flagged as a refund request for the support team.
                </p>
              )}

              <AttachmentField
                files={files}
                onChange={setFiles}
                onError={setFormError}
                disabled={!user.isVerified}
              />

              {formError && <ErrorNote message={formError} />}
              {sent && (
                <Notice tone="success">
                  Request sent — it is listed below with its current status.
                </Notice>
              )}

              <Button type="submit" loading={sending} disabled={!user.isVerified}>
                Send request
              </Button>
            </form>
          </Card>
        </section>

        <section>
          <SectionHeading title="Your requests" subtitle="Status updates from the support team." />

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Anything you send through the form appears here with its status."
            />
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Card key={ticket.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold text-ink-900">{ticket.subject}</h3>
                    <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                    <Badge tone="neutral">{ticket.category}</Badge>
                    {ticket.refundRequested && <Badge tone="danger">refund</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {ticket.orderReference ? `Order ${ticket.orderReference} · ` : ''}
                    opened {formatDate(ticket.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenThread(openThread === ticket.id ? null : ticket.id)}
                    className="mt-2 text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline"
                  >
                    {openThread === ticket.id ? 'Hide conversation' : 'Conversation'}
                  </button>
                  {openThread === ticket.id && <TicketThread ticket={ticket} />}
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  )
}
