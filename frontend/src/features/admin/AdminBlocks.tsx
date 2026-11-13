import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { HomepageBlock } from '@/api/types'
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

const BLOCK_TYPES: HomepageBlock['type'][] = [
  'hero',
  'product_carousel',
  'category_tiles',
  'banner',
  'platform_strip',
]

type BlockDraft = {
  key: string
  type: string
  title: string
  subtitle: string
  position: string
  isVisible: boolean
  productIds: string
  config: string
}

type BlockPayload = Parameters<typeof adminApi.updateBlock>[1]

const textareaClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200'

/** Marketing block manager. The homepage renders whatever is visible, ordered
 *  by position, so this screen is the only thing that decides its layout. */
export default function AdminBlocks() {
  const [blocks, setBlocks] = useState<HomepageBlock[]>([])
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

  async function deleteBlock(block: HomepageBlock) {
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
                  <span className="font-mono text-xs font-semibold text-ink-500">#{block.id}</span>
                  <h3 className="font-display text-base font-bold text-ink-900">{block.key}</h3>
                  <Badge tone={block.isVisible ? 'success' : 'neutral'}>
                    {block.isVisible ? 'visible' : 'hidden'}
                  </Badge>
                  <span className="text-xs text-ink-500">position {block.position}</span>
                  {block.products.length > 0 && (
                    <span className="text-xs text-ink-500">
                      {block.products.length} product{block.products.length === 1 ? '' : 's'} attached
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
              <h3 className="font-display text-base font-bold text-ink-900">New block</h3>
              <p className="mt-1 text-xs text-ink-500">
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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Key" error={keyError}>
          <Input
            value={draft.key}
            readOnly={keyReadOnly}
            onChange={(event) => patch({ key: event.target.value })}
            placeholder="e.g. best_sellers"
            className={keyReadOnly ? 'bg-canvas text-ink-500' : undefined}
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
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink-700">
            <input
              type="checkbox"
              checked={draft.isVisible}
              onChange={(event) => patch({ isVisible: event.target.checked })}
              className="size-4 rounded border-line accent-brand-600"
            />
            Visible on homepage
          </label>
        </div>

        <Field label="Title">
          <Input value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
        </Field>

        <Field label="Subtitle">
          <Input value={draft.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Product IDs" hint="Comma separated, for example 12, 34, 56. Empty means no fixed products.">
            <Input
              value={draft.productIds}
              onChange={(event) => patch({ productIds: event.target.value })}
              placeholder="12, 34, 56"
            />
          </Field>
        </div>
      </div>

      <Field label="Config (JSON)" error={configError} hint="Everything the block needs beyond its title, stored as a JSON object.">
        <textarea
          rows={6}
          value={draft.config}
          onChange={(event) => patch({ config: event.target.value })}
          spellCheck={false}
          className={`${textareaClass} font-mono text-xs`}
        />
      </Field>

      <ErrorNote message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <Button loading={saving} disabled={saving || deleting} onClick={() => void submit()}>
          {submitLabel}
        </Button>
        {onDelete && (
          <Button
            variant="danger"
            size="sm"
            disabled={saving || deleting}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}

function draftFromBlock(block: HomepageBlock): BlockDraft {
  return {
    key: block.key,
    type: block.type,
    title: block.title,
    subtitle: block.subtitle,
    position: String(block.position),
    isVisible: block.isVisible,
    productIds: block.products.map((product) => product.id).join(', '),
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
    productIds: '',
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

function parseProductIds(text: string): number[] {
  return text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value))
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
    productIds: parseProductIds(draft.productIds),
  }
}

function sortBlocks(blocks: HomepageBlock[]): HomepageBlock[] {
  return [...blocks].sort((a, b) => a.position - b.position || a.id - b.id)
}

export { AdminBlocks }
