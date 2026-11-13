import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { authApi } from '@/api/endpoints'
import type { User } from '@/api/types'

type AuthState = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  /** Called after register/verify so the header updates without a reload. */
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await authApi.me()
      setUser(current)
    } catch {
      // A network blip should not sign the user out visually; keep last state.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .me()
      .then(({ user: current }) => {
        if (!cancelled) setUser(current)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await authApi.login(email, password)
    setUser(signedIn)
    return signedIn
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut, refresh, setUser }),
    [user, loading, signIn, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
