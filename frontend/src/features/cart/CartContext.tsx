import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { cartApi } from '@/api/endpoints'
import type { Cart } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'

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

const CartContext = createContext<CartState | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(emptyCart)
      return
    }
    setLoading(true)
    try {
      setCart(await cartApi.get())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your cart')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback(async (offerId: number, quantity = 1) => {
    setCart(await cartApi.add(offerId, quantity))
    setError(null)
  }, [])

  const setQuantity = useCallback(async (offerId: number, quantity: number) => {
    setCart(await cartApi.setQuantity(offerId, quantity))
  }, [])

  const remove = useCallback(async (offerId: number) => {
    setCart(await cartApi.remove(offerId))
  }, [])

  const clear = useCallback(async () => {
    setCart(await cartApi.clear())
  }, [])

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
