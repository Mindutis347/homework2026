import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { adminApi, catalogApi } from '@/api/endpoints'
import type { AdminProduct, Meta } from '@/api/types'
import { ContentTypeBadge } from '@/components/ContentTypeBadge'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Notice,
  SectionHeading,
  Select,
  Skeleton,
} from '@/components/ui'
import { formatMoney } from '@/lib/format'

const GENRE_LIMIT = 10

/** Back-office catalogue editor: every field a customer can see on a product
 *  page, plus whether the entry is live. The slug is shown but not editable —
 *  it is the public URL and the search key. */
export default function AdminCatalog() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [term, setTerm] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    catalogApi.meta().then(setMeta).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .catalog(applied)
      .then(({ products: fetched }) => {
        if (cancelled) return
        setProducts(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the catalogue')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applied])

  function replaceProduct(updated: AdminProduct) {
    setProducts((prev) => prev.map((product) => (product.id === updated.id ? updated : product)))
    setNotice(`Saved “${updated.title}”.`)
    setEditingId(null)
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setApplied(term.trim())
  }

  return (
    <div>
      <SectionHeading
        title="Catalogue"
        subtitle="Edit the text, art and classification of any product, or take it off the store."
      />

      <form onSubmit={submitSearch} className="mb-5 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-sm">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by title or slug…"
            aria-label="Search the catalogue"
          />
        </div>
        <Button type="submit" size="sm">Search</Button>
        {applied && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setTerm(''); setApplied('') }}>
            Clear
          </Button>
        )}
      </form>

      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match"
          description="Try a different title, or approve a merchant request to add a new one."
        />
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <Card key={product.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <img src={product.coverUrl} alt="" className="h-20 w-15 shrink-0 rounded-[2px] object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold text-white">{product.title}</h3>
                    <ContentTypeBadge type={product.contentType} />
                    <Badge tone={product.isActive ? 'success' : 'danger'}>
                      {product.isActive ? 'live' : 'hidden'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-brand-200">
                    /{product.slug} · {product.offerCount} offer{product.offerCount === 1 ? '' : 's'}
                    {product.offerCount > 0 ? ` from ${formatMoney(product.minPriceCents)}` : ''}
                    {product.genres.length > 0 ? ` · ${product.genres.join(', ')}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={editingId === product.id ? 'secondary' : 'onDark'}
                  onClick={() => setEditingId(editingId === product.id ? null : product.id)}
                >
                  {editingId === product.id ? 'Close' : 'Edit'}
                </Button>
              </div>

              {editingId === product.id && (
                <ProductForm
                  product={product}
                  genres={meta?.genres.map((genre) => genre.slug) ?? []}
                  onSaved={replaceProduct}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

type Draft = {
  title: string
  description: string
  coverUrl: string
  heroUrl: string
  developer: string
  publisher: string
  releaseDate: string
  contentType: AdminProduct['contentType']
  isActive: boolean
  genres: string[]
}

function draftOf(product: AdminProduct): Draft {
  return {
    title: product.title,
    description: product.description,
    coverUrl: product.coverUrl,
    heroUrl: product.heroUrl,
    developer: product.developer,
    publisher: product.publisher,
    releaseDate: product.releaseDate ? product.releaseDate.slice(0, 10) : '',
    contentType: product.contentType,
    isActive: product.isActive,
    genres: product.genres,
  }
}

function ProductForm({
  product,
  genres,
  onSaved,
}: {
  product: AdminProduct
  genres: string[]
  onSaved: (updated: AdminProduct) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(product))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }))
  }

  function toggleGenre(slug: string) {
    setDraft((prev) => ({
      ...prev,
      genres: prev.genres.includes(slug)
        ? prev.genres.filter((value) => value !== slug)
        : prev.genres.length < GENRE_LIMIT ? [...prev.genres, slug] : prev.genres,
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (draft.title.trim().length < 2) {
      setError('A title is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { product: updated } = await adminApi.updateProduct(product.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        coverUrl: draft.coverUrl.trim(),
        heroUrl: draft.heroUrl.trim(),
        developer: draft.developer.trim(),
        publisher: draft.publisher.trim(),
        releaseDate: draft.releaseDate,
        contentType: draft.contentType,
        isActive: draft.isActive,
        genres: draft.genres,
      })
      onSaved(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save this product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input value={draft.title} onChange={(event) => patch({ title: event.target.value })} required />
        </Field>
        <Field label="Slug" hint="Fixed: it is the public URL and the search key.">
          <Input value={product.slug} readOnly className="bg-canvas text-brand-200" />
        </Field>
        <Field label="Developer">
          <Input value={draft.developer} onChange={(event) => patch({ developer: event.target.value })} />
        </Field>
        <Field label="Publisher">
          <Input value={draft.publisher} onChange={(event) => patch({ publisher: event.target.value })} />
        </Field>
        <Field label="Cover image URL">
          <Input value={draft.coverUrl} onChange={(event) => patch({ coverUrl: event.target.value })} />
        </Field>
        <Field label="Hero image URL">
          <Input value={draft.heroUrl} onChange={(event) => patch({ heroUrl: event.target.value })} />
        </Field>
        <Field label="Release date">
          <Input
            type="date"
            value={draft.releaseDate}
            onChange={(event) => patch({ releaseDate: event.target.value })}
          />
        </Field>
        <Field label="What is it">
          <Select
            value={draft.contentType}
            onChange={(event) => patch({ contentType: event.target.value as Draft['contentType'] })}
          >
            <option value="full">Full game</option>
            <option value="dlc">DLC / add-on</option>
            <option value="both">Game + DLC bundle</option>
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={draft.description}
          rows={3}
          onChange={(event) => patch({ description: event.target.value })}
          className="w-full rounded-[2px] border border-line bg-canvas px-3.5 py-2.5 text-sm text-white placeholder:text-brand-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        />
      </Field>

      <Field label={`Genres (${draft.genres.length}/${GENRE_LIMIT})`}>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {genres.map((slug) => {
            const active = draft.genres.includes(slug)
            return (
              <button
                key={slug}
                type="button"
                aria-pressed={active}
                onClick={() => toggleGenre(slug)}
                className={`rounded-[2px] border px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition ${
                  active
                    ? 'border-accent-500 bg-accent-500 text-on-accent'
                    : 'border-white/30 text-white hover:border-accent-500 hover:text-accent-500'
                }`}
              >
                {slug}
              </button>
            )
          })}
        </div>
      </Field>

      <label className="inline-flex items-center gap-2 text-sm font-semibold text-white">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(event) => patch({ isActive: event.target.checked })}
          className="size-4 rounded-[2px] border-line accent-brand-500"
        />
        Visible in the store
      </label>

      {error && <ErrorNote message={error} />}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Save changes</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(draftOf(product))}>
          Reset
        </Button>
      </div>
    </form>
  )
}
