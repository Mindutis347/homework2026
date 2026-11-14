import { useEffect, useRef, useState } from 'react'

import { ticketApi } from '@/api/endpoints'
import type { Ticket, TicketThread as Thread } from '@/api/types'
import { Button, ErrorNote, Spinner } from '@/components/ui'
import { AttachmentField } from '@/features/support/AttachmentField'
import type { PendingAttachment } from '@/features/support/AttachmentField'

/**
 * The support conversation for one ticket. Both sides use this component: the
 * customer's support page and the admin queue. The author side of a reply is
 * decided by the server from the caller's role, so this never sends it.
 */
export function TicketThread({ ticket, onUpdated }: { ticket: Ticket; onUpdated?: (thread: Thread) => void }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [files, setFiles] = useState<PendingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const updatedRef = useRef(onUpdated)

  // Keep the callback fresh without re-running the fetch on every parent render.
  useEffect(() => {
    updatedRef.current = onUpdated
  }, [onUpdated])

  useEffect(() => {
    let cancelled = false
    ticketApi
      .thread(ticket.id)
      .then(({ thread: fetched }) => {
        if (cancelled) return
        setThread(fetched)
        setError(null)
        updatedRef.current?.(fetched)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the conversation')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticket.id])

  async function send() {
    if (!reply.trim() && files.length === 0) return
    setSending(true)
    setError(null)
    try {
      const { thread: updated } = await ticketApi.reply(ticket.id, {
        body: reply.trim(),
        attachments: files.map((file) => ({ mime: file.mime, data: file.data })),
      })
      setThread(updated)
      setReply('')
      setFiles([])
      updatedRef.current?.(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send that message')
    } finally {
      setSending(false)
    }
  }

  const messages = thread?.messages ?? []
  // Pictures filed with the opening request are stored on a message of their own
  // with no text. Both rows are inserted in one transaction, so their created_at
  // is identical — that is how they are told apart from a later picture-only reply.
  const openingAttachments = messages
    .filter((message) => message.body === '' && message.createdAt === ticket.createdAt)
    .flatMap((message) => message.attachments)
  const replies = messages.filter((message) => !(message.body === '' && message.createdAt === ticket.createdAt))

  return (
    <div className="mt-3 border-t border-line pt-3">
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-brand-200">
          <Spinner className="size-4" /> Loading conversation…
        </p>
      ) : (
        <div className="space-y-3">
          {/* The ticket body is the opening message of the thread. */}
          <Bubble
            author={ticket.userName || ticket.userEmail}
            role="customer"
            body={ticket.body}
            at={ticket.createdAt}
            attachments={openingAttachments}
          />
          {replies.map((message) => (
            <Bubble
              key={message.id}
              author={message.authorName}
              role={message.authorRole}
              body={message.body}
              at={message.createdAt}
              attachments={message.attachments}
            />
          ))}
          {replies.length === 0 && (
            <p className="text-xs text-brand-200">No replies yet — add the first one below.</p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <textarea
          value={reply}
          rows={3}
          maxLength={4000}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Write a reply…"
          className="w-full rounded-[2px] border border-line bg-canvas px-3.5 py-2.5 text-sm text-white placeholder:text-brand-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />

        {error && <ErrorNote message={error} />}

        <AttachmentField
          files={files}
          onChange={setFiles}
          onError={setError}
          footer={(
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              loading={sending}
              disabled={(!reply.trim() && files.length === 0) || loading}
              onClick={() => void send()}
            >
              Send reply
            </Button>
          )}
        />
      </div>
    </div>
  )
}

function Bubble({
  author,
  role,
  body,
  at,
  attachments,
}: {
  author: string
  role: 'customer' | 'staff'
  body: string
  at: string
  attachments: { id: number; mime: string }[]
}) {
  const staff = role === 'staff'
  return (
    <div className={`rounded-[2px] border px-3.5 py-2.5 ${staff ? 'border-accent-500/40 bg-brand-800' : 'border-line bg-canvas'}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`text-xs font-extrabold uppercase tracking-wide ${staff ? 'text-accent-500' : 'text-brand-200'}`}>
          {staff ? 'Support' : author}
        </span>
        <span className="text-[0.6875rem] text-brand-300">{new Date(at).toLocaleString()}</span>
      </div>
      {body && <p className="mt-1 whitespace-pre-wrap text-sm text-white">{body}</p>}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={ticketApi.attachmentUrl(attachment.id)}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <img
                src={ticketApi.attachmentUrl(attachment.id)}
                alt="Attachment"
                loading="lazy"
                className="max-h-40 rounded-[2px] border border-line object-cover transition hover:border-accent-500"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
