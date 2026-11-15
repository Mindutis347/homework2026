import { CoverThumb } from '@/components/Cover'
import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { AdminBlock, AdminProduct } from '@/api/types'
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
import { HomeBlock } from '@/features/home/blocks'
import type { HomeBlockData } from '@/features/home/blocks'

const BLOCK_TYPES: AdminBlock['type'][] = [
  'hero',
  'product_carousel',
  'category_tiles',
  'banner',
  'platform_strip',
]

type Picked = { id: number; title: string; coverUrl: string }

type BlockDraft = {
  key: string
  type: string
  title: string
  subtitle: string
  position: string
  isVisible: boolean
  products: Picked[]
  config: string
}

type BlockPayload = Parameters<typeof adminApi.updateBlock>[1]

const textareaClass =
  'w-full rounded-[2px] border border-line bg-canvas px-3.5 py-2.5 text-sm text-white placeholder:text-brand-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30'

/** Marketing block manager. The homepage renders whatever is visible, ordered by
 *  position, so this screen is the only thing that decides its layout. */
export default function AdminBlocks() {
  const [blocks, setBlocks] = useState<AdminBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createToken, setCreateToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .blocks()
      .then(({ blocks: fetched }) => {
        if (cancelled) return
        setBlocks(sortBlocks(fetched))
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load homepage blocks')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveBlock(id: number, draft: BlockDraft, config: Record<string, unknown>) {
    const { block } = await adminApi.updateBlock(id, buildPayload(draft, config))
    setBlocks((prev) => sortBlocks(prev.map((item) => (item.id === id ? block : item))))
  }

  async function createBlock(draft: BlockDraft, config: Record<string, unknown>) {
    const { block } = await adminApi.createBlock(buildPayload(draft, config))
    setBlocks((prev) => sortBlocks([...prev, block]))
    setCreateToken((token) => token + 1)
  }

  async function deleteBlock(block: AdminBlock) {
    if (!window.confirm(`Delete the "${block.key}" block? The homepage will stop rendering it.`)) return
    setError(null)
    try {
      await adminApi.deleteBlock(block.id)
      setBlocks((prev) => prev.filter((item) => item.id !== block.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete that block')
    }
  }

  const nextPosition = blocks.reduce((max, block) => Math.max(max, block.position), 0) + 1

  return (
    <div>
      <SectionHeading
        title="Homepage"
        subtitle="The public homepage renders every visible block, ordered by position. Hidden blocks stay here but are not shown."
      />

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.length === 0 ? (
            <EmptyState
              title="No homepage blocks"
              description="Add a block below to give the landing page something to render."
            />
          ) : (
            blocks.map((block) => (
              <Card key={block.id} className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-3">
                  <span className="font-mono text-xs font-semibold text-brand-200">#{block.id}</span>
                  <h3 className="font-display text-base font-bold text-white">{block.key}</h3>
                  <Badge tone={block.isVisible ? 'success' : 'neutral'}>
                    {block.isVisible ? 'visible' : 'hidden'}
                  </Badge>
                  <span className="text-xs text-brand-200">position {block.position}</span>
                  {(block.productSummaries?.length ?? 0) > 0 && (
                    <span className="text-xs text-brand-200">
                      {block.productSummaries?.length} product{(block.productSummaries?.length ?? 0) === 1 ? '' : 's'} attached
                    </span>
                  )}
                </div>

                <BlockEditor
                  initial={draftFromBlock(block)}
                  submitLabel="Save"
                  keyReadOnly
                  onSubmit={(draft, config) => saveBlock(block.id, draft, config)}
                  onDelete={() => deleteBlock(block)}
                />
              </Card>
            ))
          )}

          <Card className="p-4 sm:p-5">
            <div className="mb-4 border-b border-line pb-3">
              <h3 className="font-display text-base font-bold text-white">New block</h3>
              <p className="mt-1 text-xs text-brand-200">
                Created blocks appear on the public homepage only once they are visible and positioned.
              </p>
            </div>
            <BlockEditor
              key={`new-${createToken}`}
              initial={emptyDraft(nextPosition)}
              submitLabel="Create block"
              onSubmit={createBlock}
            />
          </Card>
        </div>
      )}
    </div>
  )
}

function BlockEditor({
  initial,
  submitLabel,
  keyReadOnly = false,
  onSubmit,
  onDelete,
}: {
  initial: BlockDraft
  submitLabel: string
  keyReadOnly?: boolean
  onSubmit: (draft: BlockDraft, config: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [draft, setDraft] = useState<BlockDraft>(initial)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  function patch(next: Partial<BlockDraft>) {
    setDraft((prev) => ({ ...prev, ...next }))
  }

  async function submit() {
    setError(null)
    if (!draft.key.trim()) {
      setKeyError('A block key is required.')
      return
    }
    setKeyError(null)
    const config = parseConfig(draft.config)
    if (!config) {
      setConfigError('Config must be a JSON object, for example {"href": "/store"}.')
      setShowConfig(true)
      return
    }
    setConfigError(null)
    setSaving(true)
    try {
      await onSubmit(draft, config)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save this block')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!onDelete) return
    setError(null)
    setDeleting(true)
    try {
      await onDelete()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete this block')
    } finally {
      setDeleting(false)
    }
  }

  const config = parseConfig(draft.config) ?? {}

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Key" error={keyError}>
          <Input
            value={draft.key}
            readOnly={keyReadOnly}
            onChange={(event) => patch({ key: event.target.value })}
            placeholder="e.g. best_sellers"
            className={keyReadOnly ? 'bg-canvas text-brand-200' : undefined}
            title={keyReadOnly ? 'Block keys identify the block in the API and cannot be changed here.' : undefined}
          />
        </Field>

        <Field label="Type">
          <Select value={draft.type} onChange={(event) => patch({ type: event.target.value })}>
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Position" hint="Lower numbers render first.">
          <Input
            type="number"
            min={0}
            value={draft.position}
            onChange={(event) => patch({ position: event.target.value })}
          />
        </Field>

        <div className="flex items-end pb-2.5">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-brand-100">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => patch({ isVisible: event.target.checked })}
              className="size-4 rounded-[2px] border-line accent-brand-500"
            />
            Visible on homepage
          </label>
        </div>

        <Field label="Title">
          <Input value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
        </Field>

        <Field label="Subtitle" hint="Optional, shown under the title.">
          <Input value={draft.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} />
        </Field>
      </div>

      <ProductPicker
        value={draft.products}
        onChange={(products) => patch({ products })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="onDark" onClick={() => setShowConfig((value) => !value)}>
          {showConfig ? 'Hide config' : 'Show config (JSON)'}
        </Button>
        <Button type="button" size="sm" variant="onDark" onClick={() => setShowPreview((value) => !value)}>
          {showPreview ? 'Hide preview' : 'Preview'}
        </Button>
        <span className="text-xs text-brand-200">
          Config carries everything beyond the title: buttons, links, tiles, and `source: "new_releases"`.
        </span>
      </div>

      {showConfig && (
        <Field
          label="Config (JSON)"
          error={configError}
          hint="Stored as a JSON object. Advanced: leave the keys you do not need untouched."
        >
          <textarea
            rows={6}
            value={draft.config}
            onChange={(event) => patch({ config: event.target.value })}
            spellCheck={false}
            className={`${textareaClass} font-mono text-xs`}
          />
        </Field>
      )}

      {showPreview && (
        <BlockPreview draft={draft} config={config} />
      )}

      <ErrorNote message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <Button loading={saving} disabled={saving || deleting} onClick={() => void submit()}>
          {submitLabel}
        </Button>
        {onDelete && (
          <Button variant="danger" size="sm" disabled={saving || deleting} onClick={() => void remove()}>
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}

/** Human-friendly product picker: search the catalogue, click to attach, chips to
 *  remove. The block still stores plain ids, so the API is unchanged. */
function ProductPicker({ value, onChange }: { value: Picked[]; onChange: (next: Picked[]) => void }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<AdminProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  function moveItem(from: number, to: number) {
    if (from === to || to < 0 || to >= value.length || from < 0) return
    const next = [...value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  useEffect(() => {
    const query = term.trim()
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      adminApi
        .catalog(query)
        .then(({ products }) => {
          if (cancelled) return
          setResults(products.slice(0, 6))
          setError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setResults([])
          setError(err instanceof Error ? err.message : 'Search failed')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [term])

  const chosen = new Set(value.map((item) => item.id))

  return (
    <div className="rounded-[2px] border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-brand-200">Products in this block</p>
        <span className="text-xs text-brand-300">{value.length}/10</span>
        {value.length > 0 && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => onChange([])}>
            Clear all
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <p className="mt-2 text-xs text-brand-200">
          Nothing attached yet — search below and click a game to add it.
        </p>
      ) : (
        <>
          {value.length > 1 && (
            <p className="mt-2 text-xs text-brand-300">
              Position 1 shows first. Drag a handle, or use the arrows, to reorder.
            </p>
          )}
          <ol className="mt-2 space-y-1.5">
            {value.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={(event) => {
                  setDragging(index)
                  event.dataTransfer.effectAllowed = 'move'
                  // Firefox will not start a drag without data on the transfer.
                  event.dataTransfer.setData('text/plain', String(index))
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (over !== index) setOver(index)
                }}
                onDragLeave={() => setOver((current) => (current === index ? null : current))}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = Number(event.dataTransfer.getData('text/plain'))
                  moveItem(Number.isNaN(from) ? -1 : from, index)
                  setDragging(null)
                  setOver(null)
                }}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                className={`flex items-center gap-2 rounded-[2px] border bg-surface px-2 py-1 transition ${
                  dragging === index ? 'opacity-40' : ''
                } ${
                  over === index && dragging !== null && dragging !== index
                    ? 'border-accent-500 ring-1 ring-accent-500/40'
                    : 'border-line'
                }`}
              >
                <span
                  aria-hidden
                  title="Drag to reorder"
                  className="cursor-grab select-none text-sm leading-none text-brand-300"
                >
                  ⠿
                </span>
                <span className="w-4 text-center text-[0.625rem] font-bold text-brand-300">{index + 1}</span>
                <CoverThumb productId={item.id} url={item.coverUrl} className="h-8 w-6 rounded-[2px] object-cover" label="" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{item.title}</span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${item.title} earlier`}
                    disabled={index === 0}
                    onClick={() => moveItem(index, index - 1)}
                    className="grid size-7 place-items-center rounded-[2px] text-brand-200 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${item.title} later`}
                    disabled={index === value.length - 1}
                    onClick={() => moveItem(index, index + 1)}
                    className="grid size-7 place-items-center rounded-[2px] text-brand-200 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => onChange(value.filter((entry) => entry.id !== item.id))}
                    className="grid size-7 place-items-center rounded-[2px] text-brand-300 hover:bg-white/10 hover:text-danger"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="mt-3">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search a game to add…"
          aria-label="Search products to add to this block"
        />
        {error && <div className="mt-2"><ErrorNote message={error} /></div>}
        {searching && <p className="mt-2 text-xs text-brand-200">Searching…</p>}
        {!searching && results.length > 0 && (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[2px] border border-line">
            {results.map((product) => (
              <li key={product.id} className="flex items-center gap-2 px-2 py-1.5">
                <CoverThumb productId={product.id} url={product.coverUrl} className="h-8 w-6 rounded-[2px] object-cover" label="" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{product.title}</span>
                {chosen.has(product.id) ? (
                  <Badge tone="success">added</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={value.length >= 10}
                    onClick={() =>
                      onChange([...value, { id: product.id, title: product.title, coverUrl: product.coverUrl }])
                    }
                  >
                    Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Renders the block with the draft values, using the same component the homepage
 *  uses, so what you see here is what ships. */
function BlockPreview({ draft, config }: { draft: BlockDraft; config: Record<string, unknown> }) {
  const [cards, setCards] = useState<HomeBlockData['products']>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoSourced = config.source === 'new_releases'
  const ids = draft.products.map((product) => product.id).join(',')

  useEffect(() => {
    if (autoSourced || ids === '') {
      setCards([])
      return
    }
    let cancelled = false
    setLoading(true)
    adminApi
      .blockCards(ids.split(',').map(Number))
      .then(({ cards: fetched }) => {
        if (cancelled) return
        setCards(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setCards([])
        setError(err instanceof Error ? err.message : 'Could not build the preview')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ids, autoSourced])

  const block: HomeBlockData = {
    key: draft.key,
    type: draft.type,
    title: draft.title,
    subtitle: draft.subtitle,
    config,
    products: cards,
  }

  return (
    <div className="rounded-[2px] border border-dashed border-white/30 p-3">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-brand-200">
        Preview — {draft.isVisible ? 'visible on the homepage' : 'hidden, so it would not render'}
      </p>
      {autoSourced ? (
        <Notice tone="info">
          This block follows the release calendar (<code>source: new_releases</code>), so the live row is filled
          from products&apos; release dates rather than this list.
        </Notice>
      ) : error ? (
        <ErrorNote message={error} />
      ) : loading ? (
        <Skeleton className="h-40 w-full" />
      ) : draft.products.length === 0 && ['product_carousel', 'platform_strip', 'hero'].includes(draft.type) ? (
        <Notice tone="warning">Add at least one product to see this block rendered.</Notice>
      ) : (
        <div className="pointer-events-none select-none">
          <HomeBlock block={block} />
        </div>
      )}
    </div>
  )
}

function draftFromBlock(block: AdminBlock): BlockDraft {
  return {
    key: block.key,
    type: block.type,
    title: block.title,
    subtitle: block.subtitle,
    position: String(block.position),
    isVisible: block.isVisible,
    products: (block.productSummaries ?? []).map((product) => ({
      id: product.id,
      title: product.title,
      coverUrl: product.coverUrl,
    })),
    config: JSON.stringify(block.config, null, 2),
  }
}

function emptyDraft(position: number): BlockDraft {
  return {
    key: '',
    type: 'product_carousel',
    title: '',
    subtitle: '',
    position: String(position),
    isVisible: true,
    products: [],
    config: '{}',
  }
}

function parseConfig(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function buildPayload(draft: BlockDraft, config: Record<string, unknown>): BlockPayload {
  const position = Number.parseInt(draft.position, 10)
  return {
    key: draft.key.trim(),
    type: draft.type,
    title: draft.title,
    subtitle: draft.subtitle,
    config,
    position: Number.isFinite(position) ? position : 0,
    isVisible: draft.isVisible,
    productIds: draft.products.map((product) => product.id),
  }
}

function sortBlocks(blocks: AdminBlock[]): AdminBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position || a.id - b.id)
}
