import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { catalogApi, merchantApi } from '@/api/endpoints'
import type { MerchantOffer, Meta, ProductCard } from '@/api/types'
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
import { formatMoney } from '@/lib/format'

const textareaClass =
  'w-full rounded-[2px] border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200'

type PickedProduct = { id: number; title: string; coverUrl: string }

/** The seller's listings: price, stock of keys, and the forms to add more of either. */
export default function MerchantOffers() {
  const [offers, setOffers] = useState<MerchantOffer[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [openOfferId, setOpenOfferId] = useState<number | null>(null)
  const [bulk, setBulk] = useState('')
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [keyFeedback, setKeyFeedback] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductCard[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PickedProduct | null>(null)
  const [platformSlug, setPlatformSlug] = useState('')
  const [regionCode, setRegionCode] = useState('')
  const [price, setPrice] = useState('')
  const [compareAt, setCompareAt] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    merchantApi
      .offers()
      .then(({ offers: fetched }) => {
        if (!cancelled) {
          setOffers(fetched)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your offers')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    catalogApi
      .meta()
      .then((fetched) => {
        if (!cancelled) setMeta(fetched)
      })
      .catch((err: unknown) => {
        if (!cancelled) setMetaError(err instanceof Error ? err.message : 'Could not load platform data')
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showForm || picked) {
      setResults([])
      setSearching(false)
      return
    }
    const query = term.trim()
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const id = requestId.current + 1
    requestId.current = id
    const timer = window.setTimeout(() => {
      merchantApi
        .products(query)
        .then((page) => {
          if (requestId.current !== id) return
          setResults(page.items)
          setSearchError(null)
        })
        .catch((err: unknown) => {
          if (requestId.current !== id) return
          setResults([])
          setSearchError(err instanceof Error ? err.message : 'Search failed')
        })
        .finally(() => {
          if (requestId.current === id) setSearching(false)
        })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [term, showForm, picked])

  async function handleUpload(offer: MerchantOffer) {
    setKeyError(null)
    setKeyFeedback(null)
    if (!bulk.trim()) {
      setKeyError('Paste at least one key.')
      return
    }
    setUploadingId(offer.id)
    try {
      const result = await merchantApi.uploadKeys(offer.id, bulk)
      setOffers(result.offers)
      setKeyFeedback(`inserted ${result.inserted}, skipped ${result.skipped}`)
      setBulk('')
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Could not upload keys')
    } finally {
      setUploadingId(null)
    }
  }

  function toggleKeyPanel(offerId: number) {
    setOpenOfferId((current) => (current === offerId ? null : offerId))
    setBulk('')
    setKeyError(null)
    setKeyFeedback(null)
  }

  function resetForm() {
    setPicked(null)
    setTerm('')
    setResults([])
    setPlatformSlug('')
    setRegionCode('')
    setPrice('')
    setCompareAt('')
    setFormError(null)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)

    if (!picked) {
      setFormError('Pick a product from the catalog first.')
      return
    }
    if (!platformSlug || !regionCode) {
      setFormError('Choose a platform and a region.')
      return
    }

    const priceCents = Math.round(Number(price) * 100)
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      setFormError('Enter a price greater than 0.')
      return
    }

    let basePriceCents: number | null = null
    if (compareAt.trim() !== '') {
      basePriceCents = Math.round(Number(compareAt) * 100)
      if (!Number.isFinite(basePriceCents) || basePriceCents < priceCents) {
        setFormError('Compare-at price must be at least the selling price.')
        return
      }
    }

    setSaving(true)
    try {
      const result = await merchantApi.saveOffer({
        productId: picked.id,
        platformSlug,
        regionCode,
        priceCents,
        basePriceCents,
      })
      setOffers(result.offers)
      resetForm()
      setShowForm(false)
      setNotice(`Listing saved for ${picked.title}. Add keys to start selling.`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the listing')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionHeading
        title="Your offers"
        subtitle="Set the price, keep keys in stock, and the storefront sells them for you."
        action={
          <Button
            size="sm"
            onClick={() => {
              setShowForm((open) => !open)
              setNotice(null)
            }}
          >
            {showForm ? 'Close form' : 'New listing'}
          </Button>
        }
      />

      {notice && (
        <p className="mb-4 rounded-[2px] border border-mint-400/40 bg-mint-400/15 px-4 py-2.5 text-sm text-mint-400">
          {notice}
        </p>
      )}

      {showForm && (
        <Card className="mb-6 p-5">
          <h3 className="font-display text-lg font-bold text-ink-900">List an existing game</h3>
          <p className="mt-1 text-sm text-ink-500">
            Pick a game already in the catalog, then set your platform, region and price.
          </p>

          {metaError && (
            <div className="mt-4">
              <ErrorNote message={metaError} />
            </div>
          )}

          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <Field
              label="Product"
              hint={picked ? undefined : 'Search the catalog by title — typos are tolerated.'}
            >
              {picked ? (
                <div className="flex items-center gap-3 rounded-[2px] border border-line bg-canvas px-3 py-2">
                  <img src={picked.coverUrl} alt="" className="h-12 w-9 rounded object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
                    {picked.title}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="e.g. Elden Ring"
                  autoComplete="off"
                />
              )}
            </Field>

            {!picked && (searching || results.length > 0 || searchError) && (
              <div className="rounded-[2px] border border-line">
                {searching && (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}
                {!searching && searchError && (
                  <div className="p-3">
                    <ErrorNote message={searchError} />
                  </div>
                )}
                {!searching &&
                  !searchError &&
                  results.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() =>
                        setPicked({ id: product.id, title: product.title, coverUrl: product.coverUrl })
                      }
                      className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-white/10"
                    >
                      <img src={product.coverUrl} alt="" className="h-10 w-7 rounded object-cover" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                        {product.title}
                      </span>
                      <span className="text-xs text-ink-500">{product.offerCount} offers</span>
                    </button>
                  ))}
                {!searching && !searchError && results.length === 0 && (
                  <p className="px-3 py-3 text-sm text-ink-500">No catalog match — try another spelling.</p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Platform">
                <Select
                  value={platformSlug}
                  onChange={(event) => setPlatformSlug(event.target.value)}
                  required
                >
                  <option value="">Select platform</option>
                  {meta?.platforms.map((platform) => (
                    <option key={platform.slug} value={platform.slug}>
                      {platform.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Region">
                <Select value={regionCode} onChange={(event) => setRegionCode(event.target.value)} required>
                  <option value="">Select region</option>
                  {meta?.regions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.code} — {region.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Price" hint="EUR, converted to cents on save.">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="24.99"
                  required
                />
              </Field>

              <Field label="Compare-at price" hint="Optional — shown struck through on the product page.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={compareAt}
                  onChange={(event) => setCompareAt(event.target.value)}
                  placeholder="39.99"
                />
              </Field>
            </div>

            <ErrorNote message={formError} />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving}>
                Save listing
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm()
                  setShowForm(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error ? (
        <ErrorNote message={error} />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <EmptyState
          title="No listings yet"
          description="Create a listing, upload your key stock, and your offers go live on the storefront."
          action={<Button onClick={() => setShowForm(true)}>New listing</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-canvas text-xs font-bold uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Product</th>
                  <th scope="col" className="px-4 py-3">Platform / region</th>
                  <th scope="col" className="px-4 py-3 text-right">Price</th>
                  <th scope="col" className="px-4 py-3 text-right">Keys available</th>
                  <th scope="col" className="px-4 py-3 text-right">Keys sold</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {offers.map((offer) => (
                  <Fragment key={offer.id}>
                    <tr className="align-middle hover:bg-canvas/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={offer.coverUrl} alt="" className="h-12 w-9 rounded object-cover" />
                          <div className="min-w-0">
                            <Link
                              to={`/products/${offer.productSlug}`}
                              className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-accent-500"
                            >
                              {offer.productTitle}
                            </Link>
                            <p className="text-xs text-ink-500">Offer #{offer.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{offer.platformName}</Badge>{' '}
                        <Badge tone="neutral">{offer.regionCode}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-ink-900">{formatMoney(offer.priceCents)}</span>
                        {offer.basePriceCents !== null && offer.basePriceCents > offer.priceCents && (
                          <span className="ml-2 text-xs text-ink-300 line-through">
                            {formatMoney(offer.basePriceCents)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700">{offer.availableKeys}</td>
                      <td className="px-4 py-3 text-right text-ink-700">{offer.soldKeys}</td>
                      <td className="px-4 py-3">
                        <Badge tone={offer.isActive ? 'success' : 'neutral'}>
                          {offer.isActive ? 'active' : 'inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => toggleKeyPanel(offer.id)}>
                          {openOfferId === offer.id ? 'Close' : 'Upload keys'}
                        </Button>
                      </td>
                    </tr>

                    {openOfferId === offer.id && (
                      <tr className="bg-canvas/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="max-w-2xl space-y-3">
                            <label className="block">
                              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                                Keys for {offer.productTitle}
                              </span>
                              <textarea
                                value={bulk}
                                onChange={(event) => setBulk(event.target.value)}
                                rows={5}
                                placeholder={'XXXX-YYYY-ZZZZ\nAAAA-BBBB-CCCC'}
                                className={textareaClass}
                              />
                              <span className="mt-1 block text-xs text-ink-500">
                                One key per line. Duplicates and keys already in stock are skipped.
                              </span>
                            </label>

                            <ErrorNote message={keyError} />
                            {keyFeedback && (
                              <p className="rounded-[2px] border border-mint-400/40 bg-mint-400/15 px-3.5 py-2.5 text-sm text-mint-400">
                                Upload complete — {keyFeedback}.
                              </p>
                            )}

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                loading={uploadingId === offer.id}
                                onClick={() => void handleUpload(offer)}
                              >
                                Add keys
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setOpenOfferId(null)
                                  setBulk('')
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

export { MerchantOffers }
