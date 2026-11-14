import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { cartApi } from '@/api/endpoints'
import type { Cart } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'

type CartLine = { offerId: number; quantity: number }

type CartState = {
  cart: Cart
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (offerId: number, quantity?: number) => Promise<void>
  setQuantity: (offerId: number, quantity: number) => Promise<void>
  remove: (offerId: number) => Promise<void>
  clear: () => Promise<void>
}

const emptyCart: Cart = { items: [], itemCount: 0, subtotalCents: 0 }

/** Guests keep their cart in the browser; the server prices it. */
const STORAGE_KEY = 'keyforge.guest-cart'
const MAX_PER_LINE = 10
const MAX_LINES = 20

function readGuestLines(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((line): line is CartLine =>
        typeof line?.offerId === 'number' && typeof line?.quantity === 'number' && line.quantity >= 1)
      .slice(0, MAX_LINES)
  } catch {
    return []
  }
}

function writeGuestLines(lines: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // Private mode or a full quota: the in-memory cart still works for this visit.
  }
}

const CartContext = createContext<CartState | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestLines, setGuestLines] = useState<CartLine[]>(() => readGuestLines())

  // Guests: re-price the local cart on the server whenever it changes, so totals
  // and stock always come from the database, never from the browser.
  useEffect(() => {
    if (user) return
    if (guestLines.length === 0) {
      setCart(emptyCart)
      return
    }
    let cancelled = false
    setLoading(true)
    cartApi
      .preview(guestLines)
      .then((preview) => {
        if (!cancelled) {
          setCart(preview)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your cart')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [guestLines, user])

  // Signing in: fold anything collected as a guest into the account cart once,
  // then the server cart is the source of truth.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    const pending = readGuestLines()
    const load = pending.length > 0
      ? cartApi.merge(pending).then((merged) => {
          writeGuestLines([])
          setGuestLines([])
          return merged
        })
      : cartApi.get()
    load
      .then((fetched) => {
        if (cancelled) return
        setCart(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load your cart')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(guestLines.length ? await cartApi.preview(guestLines) : emptyCart)
      return
    }
    try {
      setCart(await cartApi.get())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your cart')
    }
  }, [user, guestLines])

  const writeGuest = useCallback((mutate: (lines: CartLine[]) => CartLine[]) => {
    setGuestLines((prev) => {
      const next = mutate(prev).slice(0, MAX_LINES)
      writeGuestLines(next)
      return next
    })
  }, [])

  const add = useCallback(
    async (offerId: number, quantity = 1) => {
      if (user) {
        setCart(await cartApi.add(offerId, quantity))
        setError(null)
        return
      }
      writeGuest((lines) => {
        const existing = lines.find((line) => line.offerId === offerId)
        if (!existing) return [...lines, { offerId, quantity: Math.min(quantity, MAX_PER_LINE) }]
        return lines.map((line) =>
          line.offerId === offerId
            ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_PER_LINE) }
            : line)
      })
    },
    [user, writeGuest],
  )

  const setQuantity = useCallback(
    async (offerId: number, quantity: number) => {
      if (user) {
        setCart(await cartApi.setQuantity(offerId, quantity))
        return
      }
      writeGuest((lines) =>
        lines.map((line) =>
          line.offerId === offerId ? { ...line, quantity: Math.min(Math.max(quantity, 1), MAX_PER_LINE) } : line))
    },
    [user, writeGuest],
  )

  const remove = useCallback(
    async (offerId: number) => {
      if (user) {
        setCart(await cartApi.remove(offerId))
        return
      }
      writeGuest((lines) => lines.filter((line) => line.offerId !== offerId))
    },
    [user, writeGuest],
  )

  const clear = useCallback(async () => {
    if (user) {
      setCart(await cartApi.clear())
      return
    }
    writeGuest(() => [])
  }, [user, writeGuest])

  const value = useMemo<CartState>(
    () => ({ cart, loading, error, refresh, add, setQuantity, remove, clear }),
    [cart, loading, error, refresh, add, setQuantity, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
