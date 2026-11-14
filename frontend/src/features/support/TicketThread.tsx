import { useEffect, useRef, useState } from 'react'

import { ticketApi } from '@/api/endpoints'
import type { Ticket, TicketThread as Thread } from '@/api/types'
import { Button, ErrorNote, Spinner } from '@/components/ui'

const MAX_FILES = 3
const MAX_BYTES = 1_500_000
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

type Pending = { name: string; mime: string; data: string; bytes: number }

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

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
  const [files, setFiles] = useState<Pending[]>([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
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

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    const next: Pending[] = []
    for (const file of Array.from(list)) {
      if (files.length + next.length >= MAX_FILES) {
        setError(`At most ${MAX_FILES} pictures per message.`)
        break
      }
      if (!ACCEPTED.includes(file.type)) {
        setError(`${file.name}: only PNG, JPEG, WebP or GIF pictures.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 1.5 MB.`)
        continue
      }
      try {
        next.push({ name: file.name, mime: file.type, data: await readBase64(file), bytes: file.size })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not read that picture')
      }
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES))
    if (fileRef.current) fileRef.current.value = ''
  }

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
            attachments={[]}
          />
          {messages.map((message) => (
            <Bubble
              key={message.id}
              author={message.authorName}
              role={message.authorRole}
              body={message.body}
              at={message.createdAt}
              attachments={message.attachments}
            />
          ))}
          {messages.length === 0 && (
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

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative">
                <img
                  src={`data:${file.mime};base64,${file.data}`}
                  alt={file.name}
                  className="h-20 w-20 rounded-[2px] border border-line object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-xs font-bold text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <ErrorNote message={error} />}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(',')}
            multiple
            className="hidden"
            onChange={(event) => void addFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="onDark"
            size="sm"
            disabled={files.length >= MAX_FILES}
            onClick={() => fileRef.current?.click()}
          >
            Attach picture
          </Button>
          <span className="text-xs text-brand-200">Up to 3 PNG/JPEG/WebP/GIF, 1.5 MB each</span>
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
        </div>
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
