import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { catalogApi, merchantApi } from '@/api/endpoints'
import type { Meta, ProductRequest } from '@/api/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  SectionHeading,
  Select,
  Skeleton,
} from '@/components/ui'
import { formatDate } from '@/lib/format'

const textareaClass =
  'w-full rounded-[2px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200'

const STATUS_TONE = {
  pending: 'accent',
  approved: 'success',
  rejected: 'danger',
} as const

/** Catalog proposals: a merchant asks for a missing title, an admin approves it. */
export default function MerchantRequests() {
  const [requests, setRequests] = useState<ProductRequest[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [platformSlug, setPlatformSlug] = useState('')
  const [regionCode, setRegionCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    merchantApi
      .requests()
      .then(({ requests: fetched }) => {
        if (!cancelled) {
          setRequests(fetched)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your requests')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    catalogApi
      .meta()
      .then((fetched) => {
        if (!cancelled) setMeta(fetched)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)

    if (title.trim().length < 2) {
      setFormError('Enter the game title.')
      return
    }
    if (!platformSlug || !regionCode) {
      setFormError('Choose a platform and a region.')
      return
    }

    setSaving(true)
    try {
      const { request } = await merchantApi.createRequest({
        title: title.trim(),
        description: description.trim(),
        coverUrl: coverUrl.trim(),
        platformSlug,
        regionCode,
      })
      setRequests((current) => [request, ...current])
      setTitle('')
      setDescription('')
      setCoverUrl('')
      setPlatformSlug('')
      setRegionCode('')
      setNotice('Request submitted — an administrator will review it.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionHeading
        title="Catalog requests"
        subtitle="Ask for a game that is missing from the catalog. An admin reviews every request; once approved the title appears in the catalog and you can list it."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">Your requests</h3>

          {error ? (
            <ErrorNote message={error} />
          ) : loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="When a game you want to sell is missing, propose it with the form on the right."
            />
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <Card key={request.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-900">{request.title}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        {request.platformSlug} · {request.regionCode} · submitted {formatDate(request.createdAt)}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
                  </div>

                  {request.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-700">{request.description}</p>
                  )}

                  {request.adminNote && (
                    <p className="mt-3 rounded-[2px] bg-canvas px-3 py-2 text-sm text-ink-700">
                      <span className="font-semibold text-ink-900">Admin note: </span>
                      {request.adminNote}
                    </p>
                  )}

                  {request.status === 'approved' && request.productSlug && (
                    <p className="mt-2 text-xs font-semibold text-[#0b7a5e]">
                      Live in the catalog — create an offer for it on the Offers &amp; keys tab.
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card className="h-fit p-5 lg:sticky lg:top-20">
          <h3 className="font-display text-lg font-bold text-ink-900">Request a game</h3>
          <p className="mt-1 text-sm text-ink-500">
            Include a cover image URL so the catalog entry is complete.
          </p>

          {notice && (
            <p className="mt-4 rounded-[2px] border border-mint-400/60 bg-mint-100 px-3.5 py-2.5 text-sm text-[#0b7a5e]">
              {notice}
            </p>
          )}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <Field label="Game title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Hollow Knight: Silksong"
                required
              />
            </Field>

            <Field label="Description" hint="Optional — publisher, edition, anything an admin should know.">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Short description of the game"
                className={textareaClass}
              />
            </Field>

            <Field label="Cover image URL" hint="Optional — a direct link to the box art.">
              <Input
                type="url"
                value={coverUrl}
                onChange={(event) => setCoverUrl(event.target.value)}
                placeholder="https://…/cover.jpg"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Platform">
                <Select
                  value={platformSlug}
                  onChange={(event) => setPlatformSlug(event.target.value)}
                  required
                >
                  <option value="">Select</option>
                  {meta?.platforms.map((platform) => (
                    <option key={platform.slug} value={platform.slug}>
                      {platform.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Region">
                <Select value={regionCode} onChange={(event) => setRegionCode(event.target.value)} required>
                  <option value="">Select</option>
                  {meta?.regions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <ErrorNote message={formError} />

            <Button type="submit" loading={saving} className="w-full">
              Submit request
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

export { MerchantRequests }
