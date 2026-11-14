import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { TaxSettings } from '@/api/types'
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Notice,
  SectionHeading,
  Skeleton,
} from '@/components/ui'
import { formatMoney } from '@/lib/format'

/** Basis points are the storage unit (500 = 5%); the form works in percent. */
function toPercent(basisPoints: number): string {
  return String(basisPoints / 100)
}

function toBasisPoints(percent: string): number {
  const value = Number(percent)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/** Demo tax configuration: how much, and where it applies. Wallet payments are
 *  deliberately exempt, so a top-up is the tax-free route. */
export default function AdminSettings() {
  const [settings, setSettings] = useState<TaxSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [topupPercent, setTopupPercent] = useState('0')
  const [purchasePercent, setPurchasePercent] = useState('0')
  const [applyOnTopup, setApplyOnTopup] = useState(true)
  const [applyOnPurchase, setApplyOnPurchase] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .taxes()
      .then(({ taxes }) => {
        if (cancelled) return
        setSettings(taxes)
        setTopupPercent(toPercent(taxes.topupTaxBasisPoints))
        setPurchasePercent(toPercent(taxes.purchaseTaxBasisPoints))
        setApplyOnTopup(taxes.applyOnTopup)
        setApplyOnPurchase(taxes.applyOnPurchase)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the tax settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { taxes } = await adminApi.updateTaxes({
        topupTaxBasisPoints: toBasisPoints(topupPercent),
        purchaseTaxBasisPoints: toBasisPoints(purchasePercent),
        applyOnTopup,
        applyOnPurchase,
      })
      setSettings(taxes)
      setTopupPercent(toPercent(taxes.topupTaxBasisPoints))
      setPurchasePercent(toPercent(taxes.purchaseTaxBasisPoints))
      setNotice('Tax settings saved. Checkout picks them up on the next price quote.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save the tax settings')
    } finally {
      setSaving(false)
    }
  }

  const topupBp = applyOnTopup ? toBasisPoints(topupPercent) : 0
  const purchaseBp = applyOnPurchase ? toBasisPoints(purchasePercent) : 0
  const sampleTopup = 2500
  const samplePurchase = 5000

  return (
    <div>
      <SectionHeading
        title="Settings"
        subtitle="Demo transaction taxes. They are charged on card payments only — a wallet top-up or a wallet purchase carries no tax."
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="p-5">
            <form onSubmit={save} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Top-up tax (%)" hint="Charged on top of the amount credited.">
                  <Input
                    value={topupPercent}
                    onChange={(event) => setTopupPercent(event.target.value)}
                    inputMode="decimal"
                    aria-label="Top-up tax percentage"
                  />
                </Field>
                <Field label="Purchase tax (%)" hint="Added to card payments at checkout.">
                  <Input
                    value={purchasePercent}
                    onChange={(event) => setPurchasePercent(event.target.value)}
                    inputMode="decimal"
                    aria-label="Purchase tax percentage"
                  />
                </Field>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-extrabold uppercase tracking-wide text-brand-200">
                  Where it applies
                </legend>
                <label className="flex items-center gap-2 text-sm font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={applyOnTopup}
                    onChange={(event) => setApplyOnTopup(event.target.checked)}
                    className="size-4 rounded-[2px] border-line accent-brand-500"
                  />
                  Wallet top-ups
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={applyOnPurchase}
                    onChange={(event) => setApplyOnPurchase(event.target.checked)}
                    className="size-4 rounded-[2px] border-line accent-brand-500"
                  />
                  Card purchases at checkout
                </label>
                <p className="text-xs text-brand-200">
                  Wallet payments at checkout are always tax-free, whatever is set here.
                </p>
              </fieldset>

              {notice && <Notice tone="success">{notice}</Notice>}
              {error && <ErrorNote message={error} />}

              <div className="flex items-center gap-3">
                <Button type="submit" loading={saving}>Save tax settings</Button>
                {settings && (
                  <span className="text-xs text-brand-200">
                    Last saved {new Date(settings.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </form>
          </Card>

          <Card className="h-fit p-5">
            <h2 className="font-display text-lg font-extrabold text-white">What buyers would pay</h2>
            <ul className="mt-3 space-y-3 text-sm">
              <li>
                <p className="text-brand-200">
                  {formatMoney(sampleTopup)} top-up
                  {applyOnTopup ? ` + ${toPercent(topupBp)}% tax` : ' (no top-up tax)'}
                </p>
                <p className="font-extrabold text-white">
                  card charged {formatMoney(sampleTopup + Math.round((sampleTopup * topupBp) / 10000))}
                  {' · '}wallet credited {formatMoney(sampleTopup)}
                </p>
              </li>
              <li>
                <p className="text-brand-200">
                  {formatMoney(samplePurchase)} card purchase
                  {applyOnPurchase ? ` + ${toPercent(purchaseBp)}% tax` : ' (no purchase tax)'}
                </p>
                <p className="font-extrabold text-white">
                  charged {formatMoney(samplePurchase + Math.round((samplePurchase * purchaseBp) / 10000))}
                </p>
              </li>
              <li>
                <p className="text-brand-200">{formatMoney(samplePurchase)} wallet purchase</p>
                <p className="font-extrabold text-white">charged {formatMoney(samplePurchase)} · no tax</p>
              </li>
            </ul>
            <p className="mt-4 text-xs text-brand-200">
              The storefront never shows tax on product pages; it only appears in the checkout summary
              and on the receipt.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
