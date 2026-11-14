import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Meta, ProductCard as ProductCardType } from '@/api/types'
import { ProductGrid } from '@/components/ProductCard'
import { Badge, Button, Card, EmptyState, Input, PageBand, Select, Skeleton } from '@/components/ui'
import { formatMoney } from '@/lib/format'

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest releases' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'title', label: 'Title A–Z' },
]

const PAGE_SIZE = 24

/** Reads a repeatable filter from the URL. Repeated parameters and the older
 *  comma-separated form both work, so old links keep resolving. */
function multiValues(params: URLSearchParams, key: string): string[] {
  const out: string[] = []
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(',')) {
      const value = part.trim()
      if (value && !out.includes(value)) out.push(value)
    }
  }
  return out
}

/** Cents in the URL, euros in the inputs. */
function eurosFromParam(params: URLSearchParams, key: string): string {
  const raw = params.get(key)
  if (!raw) return ''
  const cents = Number(raw)
  return Number.isFinite(cents) ? String(cents / 100) : ''
}

/** The store: URL is the source of truth for every filter, so any view is
 *  shareable and the back button works. Platform, region and genre are
 *  multi-select; price is a range. */
export default function StorePage() {
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [items, setItems] = useState<ProductCardType[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Typed fields keep a local draft and otherwise derive from the URL, so the
  // inputs follow back/forward and chip removals without a syncing effect.
  const [searchDraft, setSearchDraft] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<{ from: string; to: string } | null>(null)

  const platforms = useMemo(() => multiValues(params, 'platform'), [params])
  const regions = useMemo(() => multiValues(params, 'region'), [params])
  const genres = useMemo(() => multiValues(params, 'genre'), [params])
  const queryText = params.get('q') ?? ''
  const minCents = Number(params.get('minPriceCents') ?? '') || undefined
  const maxCents = Number(params.get('maxPriceCents') ?? '') || undefined
  const search = searchDraft ?? queryText
  const priceFrom = priceDraft?.from ?? eurosFromParam(params, 'minPriceCents')
  const priceTo = priceDraft?.to ?? eurosFromParam(params, 'maxPriceCents')

  const query = useMemo(
    () => ({
      q: queryText,
      platform: platforms,
      region: regions,
      genre: genres,
      minPriceCents: minCents,
      maxPriceCents: maxCents,
      sort: params.get('sort') ?? 'popular',
      page: Number(params.get('page') ?? 1),
    }),
    [params, queryText, platforms, regions, genres, minCents, maxCents],
  )

  useEffect(() => {
    catalogApi.meta().then(setMeta).catch(() => undefined)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    catalogApi
      .products({ ...query, pageSize: PAGE_SIZE }, controller.signal)
      .then((result) => {
        setItems(result.items)
        setTotal(result.total)
        setError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Could not load products')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query])

  function rewrite(mutate: (merged: URLSearchParams) => void) {
    const merged = new URLSearchParams(params)
    mutate(merged)
    setParams(merged, { replace: true })
  }

  function toggleFilter(key: string, value: string) {
    const current = multiValues(params, key)
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    rewrite((merged) => {
      merged.delete(key)
      for (const item of next) merged.append(key, item)
      merged.delete('page')
    })
  }

  function clearParam(...keys: string[]) {
    setSearchDraft(null)
    setPriceDraft(null)
    rewrite((merged) => {
      for (const key of keys) merged.delete(key)
      merged.delete('page')
    })
  }

  function applySearch(event: FormEvent) {
    event.preventDefault()
    setSearchDraft(null)
    rewrite((merged) => {
      const value = search.trim()
      if (value) merged.set('q', value)
      else merged.delete('q')
      merged.delete('page')
    })
  }

  function applyPrice(event: FormEvent) {
    event.preventDefault()
    setPriceDraft(null)
    rewrite((merged) => {
      for (const [key, raw] of [
        ['minPriceCents', priceFrom],
        ['maxPriceCents', priceTo],
      ] as const) {
        const value = Number(raw)
        if (raw.trim() !== '' && Number.isFinite(value) && value > 0) merged.set(key, String(Math.round(value * 100)))
        else merged.delete(key)
      }
      merged.delete('page')
    })
  }

  const label = {
    platform: (slug: string) => meta?.platforms.find((item) => item.slug === slug)?.name ?? slug,
    region: (code: string) => code,
    genre: (slug: string) => meta?.genres.find((item) => item.slug === slug)?.name ?? slug,
  }

  const activeFilters: { key: string; value?: string; label: string }[] = [
    ...(queryText ? [{ key: 'q', label: `“${queryText}”` }] : []),
    ...platforms.map((slug) => ({ key: 'platform', value: slug, label: label.platform(slug) })),
    ...regions.map((code) => ({ key: 'region', value: code, label: label.region(code) })),
    ...genres.map((slug) => ({ key: 'genre', value: slug, label: label.genre(slug) })),
    ...(minCents ? [{ key: 'minPriceCents', label: `from ${formatMoney(minCents)}` }] : []),
    ...(maxCents ? [{ key: 'maxPriceCents', label: `up to ${formatMoney(maxCents)}` }] : []),
  ]

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <PageBand
        eyebrow="Catalogue"
        title="Store"
        subtitle={loading ? 'Loading catalogue…' : `${total} game${total === 1 ? '' : 's'} with live offers`}
      />

      <div className="container-page py-8">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
            <Card className="space-y-6 p-4 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
              <form onSubmit={applySearch} className="space-y-2">
                <h2 className="label-caps text-brand-200">Search</h2>
                <Input
                  value={search}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Game title…"
                  aria-label="Search the catalogue"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Search</Button>
                  {queryText && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => clearParam('q')}>
                      Clear
                    </Button>
                  )}
                </div>
              </form>

              <FilterGroup title="Price range" hint="In euro, both ends optional">
                <form onSubmit={applyPrice} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      value={priceFrom}
                      onChange={(event) => setPriceDraft({ from: event.target.value, to: priceTo })}
                      placeholder="From"
                      aria-label="Minimum price in euro"
                    />
                    <span aria-hidden className="text-brand-300">–</span>
                    <Input
                      inputMode="decimal"
                      value={priceTo}
                      onChange={(event) => setPriceDraft({ from: priceFrom, to: event.target.value })}
                      placeholder="To"
                      aria-label="Maximum price in euro"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">Apply</Button>
                    {(minCents || maxCents) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => clearParam('minPriceCents', 'maxPriceCents')}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {meta && (
                    <p className="text-xs text-brand-200">
                      Catalogue runs {formatMoney(meta.priceRange.minCents)} – {formatMoney(meta.priceRange.maxCents)}
                    </p>
                  )}
                </form>
              </FilterGroup>

              <FilterGroup title="Platform" hint="Pick as many as you like">
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={platforms.length === 0} onClick={() => clearParam('platform')}>
                    All
                  </FilterChip>
                  {meta?.platforms.map((platform) => (
                    <FilterChip
                      key={platform.slug}
                      active={platforms.includes(platform.slug)}
                      onClick={() => toggleFilter('platform', platform.slug)}
                    >
                      {platform.name}
                    </FilterChip>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup title="Region">
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={regions.length === 0} onClick={() => clearParam('region')}>
                    All
                  </FilterChip>
                  {meta?.regions.map((region) => (
                    <FilterChip
                      key={region.code}
                      active={regions.includes(region.code)}
                      onClick={() => toggleFilter('region', region.code)}
                    >
                      {region.code}
                    </FilterChip>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup title="Genre" hint="Scrolls, 18 genres">
                <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  <FilterChip active={genres.length === 0} onClick={() => clearParam('genre')}>
                    All
                  </FilterChip>
                  {meta?.genres.map((genre) => (
                    <FilterChip
                      key={genre.slug}
                      active={genres.includes(genre.slug)}
                      onClick={() => toggleFilter('genre', genre.slug)}
                    >
                      {genre.name}
                    </FilterChip>
                  ))}
                </div>
              </FilterGroup>


              {activeFilters.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
                  Clear all filters
                </Button>
              )}
            </Card>
          </aside>

          <section>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                variant="onDark"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowFilters((value) => !value)}
              >
                {showFilters ? 'Hide filters' : 'Filters'}
              </Button>
              <div className="ml-auto w-full sm:w-56">
                <Select value={query.sort} onChange={(event) => rewrite((merged) => {
                  merged.set('sort', event.target.value)
                  merged.delete('page')
                })} aria-label="Sort products">
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {activeFilters.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <button
                    key={`${filter.key}-${filter.value ?? ''}`}
                    onClick={() =>
                      filter.value
                        ? toggleFilter(filter.key, filter.value)
                        : clearParam(filter.key)
                    }
                    className="inline-flex items-center gap-1.5 rounded-[2px] border border-brand-300/60 bg-brand-500/30 px-3 py-1 text-xs font-bold text-white hover:border-accent-500 hover:text-accent-500"
                  >
                    {filter.label}
                    <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            )}

            {error ? (
              <EmptyState title="Could not load the catalogue" description={error} />
            ) : loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-[3/4]" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title="No games match those filters"
                description="Try removing a filter or searching for a different title — search tolerates typos."
                action={<Button onClick={() => setParams({}, { replace: true })}>Reset filters</Button>}
              />
            ) : (
              <>
                <ProductGrid products={items} />
                {pageCount > 1 && (
                  <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
                    <Button
                      variant="onDark"
                      size="sm"
                      disabled={query.page <= 1}
                      onClick={() =>
                        rewrite((merged) => merged.set('page', String(query.page - 1)))
                      }
                    >
                      Previous
                    </Button>
                    <Badge tone="neutral">
                      Page {query.page} of {pageCount}
                    </Badge>
                    <Button
                      variant="onDark"
                      size="sm"
                      disabled={query.page >= pageCount}
                      onClick={() =>
                        rewrite((merged) => merged.set('page', String(query.page + 1)))
                      }
                    >
                      Next
                    </Button>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FilterGroup({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="mb-1 label-caps text-brand-200">{title}</h2>
      {hint && <p className="mb-2 text-[0.6875rem] text-brand-300">{hint}</p>}
      {children}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[2px] border px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
        active
          ? 'border-accent-500 bg-accent-500 text-on-accent'
          : 'border-white/30 bg-transparent text-white hover:border-accent-500 hover:text-accent-500'
      }`}
    >
      {children}
    </button>
  )
}
