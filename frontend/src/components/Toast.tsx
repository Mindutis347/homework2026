import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Tone = 'info' | 'success' | 'danger'

type Toast = {
  id: number
  message: string
  tone: Tone
  action?: { label: string; to: string }
}

type ToastState = {
  notify: (message: string, options?: { tone?: Tone; action?: Toast['action'] }) => void
}

const ToastContext = createContext<ToastState | null>(null)

const LIFETIME_MS = 6000

const TONES: Record<Tone, string> = {
  info: 'border-white/25 bg-brand-800 text-white',
  success: 'border-mint-400/40 bg-brand-800 text-mint-300',
  danger: 'border-danger/40 bg-brand-800 text-[#ffb3bf]',
}

/** Transient confirmations ("your guest cart was merged") that do not deserve a
 *  page-level Notice. Toasts stack bottom-right, dismiss themselves, and can
 *  carry one link — never a required action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback<ToastState['notify']>((message, options) => {
    const id = ++nextId.current
    setToasts((prev) => [...prev.slice(-2), { id, message, tone: options?.tone ?? 'info', action: options?.action }])
    setTimeout(() => dismiss(id), LIFETIME_MS)
  }, [dismiss])

  const value = useMemo<ToastState>(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[2px] border px-4 py-3 text-sm font-semibold shadow-lg ${TONES[toast.tone]}`}
          >
            <p className="flex-1">{toast.message}</p>
            {toast.action && (
              <Link
                to={toast.action.to}
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline"
              >
                {toast.action.label}
              </Link>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 shrink-0 text-brand-300 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
