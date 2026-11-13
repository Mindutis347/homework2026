import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Meta, ProductCard as ProductCardType } from '@/api/types'
import { ProductGrid } from '@/components/ProductCard'
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '@/components/ui'
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

/** The store: URL is the source of truth for every filter, so any view is
 *  shareable and the back button works. */
export default function StorePage() {
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [items, setItems] = useState<ProductCardType[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const query = useMemo(
    () => ({
      q: params.get('q') ?? '',
      platform: params.get('platform') ?? '',
      region: params.get('region') ?? '',
      genre: params.get('genre') ?? '',
      sort: params.get('sort') ?? 'popular',
      page: Number(params.get('page') ?? 1),
      maxPriceCents: params.get('maxPriceCents') ? Number(params.get('maxPriceCents')) : undefined,
    }),
    [params],
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

  function update(next: Record<string, string | number | undefined>, resetPage = true) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || value === null) merged.delete(key)
      else merged.set(key, String(value))
    }
    if (resetPage) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const activeFilters = [
    query.q && { key: 'q', label: `“${query.q}”` },
    query.platform && { key: 'platform', label: meta?.platforms.find((p) => p.slug === query.platform)?.name ?? query.platform },
    query.region && { key: 'region', label: query.region },
    query.genre && { key: 'genre', label: meta?.genres.find((g) => g.slug === query.genre)?.name ?? query.genre },
    query.maxPriceCents && { key: 'maxPriceCents', label: `Under ${formatMoney(query.maxPriceCents)}` },
  ].filter(Boolean) as { key: string; label: string }[]

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <header className="bg-brand-600 py-8 text-white">
        <div className="container-page">
          <p className="label-caps text-brand-200">Catalogue</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-[2rem]">Store</h1>
          <p className="mt-1 text-sm font-medium text-brand-100">
            {loading ? 'Loading catalogue…' : `${total} game${total === 1 ? '' : 's'} with live offers`}
          </p>
        </div>
      </header>

      <div className="container-page py-8">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
          <Card className="sticky top-32 space-y-6 p-4">
            <FilterGroup title="Platform">
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={!query.platform} onClick={() => update({ platform: '' })}>
                  All
                </FilterChip>
                {meta?.platforms.map((platform) => (
                  <FilterChip
                    key={platform.slug}
                    active={query.platform === platform.slug}
                    onClick={() => update({ platform: platform.slug })}
                  >
                    {platform.name}
                  </FilterChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Region">
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={!query.region} onClick={() => update({ region: '' })}>
                  All
                </FilterChip>
                {meta?.regions.map((region) => (
                  <FilterChip
                    key={region.code}
                    active={query.region === region.code}
                    onClick={() => update({ region: region.code })}
                  >
                    {region.code}
                  </FilterChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Genre">
              <Select value={query.genre} onChange={(e) => update({ genre: e.target.value })}>
                <option value="">All genres</option>
                {meta?.genres.map((genre) => (
                  <option key={genre.slug} value={genre.slug}>
                    {genre.name}
                  </option>
                ))}
              </Select>
            </FilterGroup>

            <FilterGroup title="Max price">
              <input
                type="range"
                min={meta?.priceRange.minCents ?? 499}
                max={Math.min(meta?.priceRange.maxCents ?? 6999, 8000)}
                step={100}
                value={query.maxPriceCents ?? Math.min(meta?.priceRange.maxCents ?? 6999, 8000)}
                onChange={(e) => update({ maxPriceCents: Number(e.target.value) })}
                className="w-full accent-brand-600"
                aria-label="Maximum price"
              />
              <p className="mt-1 text-xs text-ink-500">
                Up to {formatMoney(query.maxPriceCents ?? Math.min(meta?.priceRange.maxCents ?? 6999, 8000))}
              </p>
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
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? 'Hide filters' : 'Filters'}
            </Button>
            <div className="ml-auto w-full sm:w-56">
              <Select value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort products">
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
                  key={filter.key}
                  onClick={() => update({ [filter.key]: '' })}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 hover:bg-brand-100"
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
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4]" />
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
                    variant="ghost"
                    size="sm"
                    disabled={query.page <= 1}
                    onClick={() => update({ page: query.page - 1 }, false)}
                  >
                    Previous
                  </Button>
                  <Badge tone="neutral">
                    Page {query.page} of {pageCount}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={query.page >= pageCount}
                    onClick={() => update({ page: query.page + 1 }, false)}
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

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 label-caps text-ink-500">{title}</h2>
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
      onClick={onClick}
      className={`rounded-[2px] border px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-ink-700 hover:border-brand-400 hover:text-brand-700'
      }`}
    >
      {children}
    </button>
  )
}
