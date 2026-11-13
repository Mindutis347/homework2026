import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

/** Shared UI primitives. Everything visual composes from the theme tokens in
 *  index.css, so there is one place to retheme. The shapes are deliberately
 *  sharp (2px) and the CTAs bold and uppercase, following eneba.com. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-ink-900 hover:bg-accent-400 active:bg-accent-600',
  secondary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  ghost: 'bg-transparent text-ink-700 hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-danger text-white hover:brightness-110',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-xs',
  md: 'h-11 px-5 text-[0.8rem]',
  lg: 'h-12 px-7 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] font-extrabold uppercase tracking-wide transition
        disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

export function Badge({
  children,
  tone = 'brand',
  className = '',
}: {
  children: ReactNode
  tone?: 'brand' | 'accent' | 'success' | 'danger' | 'neutral'
  className?: string
}) {
  const tones = {
    brand: 'bg-brand-600 text-white',
    accent: 'bg-accent-500 text-ink-900',
    success: 'bg-mint-100 text-[#0b7a5e]',
    danger: 'bg-red-50 text-danger',
    neutral: 'bg-canvas text-ink-700',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2px] border border-line bg-surface shadow-card ${className}`}>{children}</div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-ink-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-500">{hint}</span>
      ) : null}
    </label>
  )
}

const controlClass =
  'w-full rounded-[2px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${controlClass} ${className}`} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`${controlClass} ${className}`} />
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-[2px] border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-danger">
      {message}
    </p>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-[2px] border border-dashed border-line bg-surface px-6 py-14 text-center">
      <h3 className="font-display text-lg font-extrabold text-brand-900">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[2px] bg-line/70 ${className}`} />
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-extrabold text-brand-900 sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
