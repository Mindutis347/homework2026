import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

/** Shared UI primitives. Everything visual composes from the theme tokens in
 *  index.css, so there is one place to retheme. The shapes are deliberately
 *  sharp (2px) and the CTAs bold and uppercase, following eneba.com. There are
 *  no white surfaces in the app: panels are dark navy on the purple canvas, and
 *  type on them is white. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onDark'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-on-accent hover:bg-accent-400 active:bg-accent-600',
  secondary: 'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600',
  ghost: 'bg-transparent text-brand-100 hover:bg-white/10 hover:text-white',
  danger: 'bg-danger text-white hover:brightness-110',
  // For controls that sit directly on the purple canvas rather than in a panel.
  onDark: 'border border-white/40 bg-transparent text-white hover:border-accent-500 hover:text-accent-500',
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
    brand: 'bg-brand-500 text-white',
    accent: 'bg-accent-500 text-on-accent',
    success: 'bg-mint-400/20 text-mint-400',
    danger: 'bg-danger/20 text-[#ff9fb0]',
    neutral: 'bg-white/10 text-white',
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
    <div className={`rounded-[2px] border border-line bg-surface ${className}`}>{children}</div>
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
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-100">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-[#ff9fb0]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-brand-200">{hint}</span>
      ) : null}
    </label>
  )
}

const controlClass =
  'w-full rounded-[2px] border border-line bg-canvas px-3.5 py-2.5 text-sm text-white placeholder:text-brand-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${controlClass} ${className}`} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`${controlClass} ${className}`} />
}

/** One notice component for every status message, so success/warning/error never
 *  drift into ad-hoc colour classes. Tints are dark-friendly: translucent fills
 *  over the panel, never a light block. */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  const tones = {
    info: 'border-white/25 bg-white/10 text-white',
    success: 'border-mint-400/40 bg-mint-400/15 text-mint-400',
    warning: 'border-accent-500/40 bg-accent-500/15 text-accent-300',
    danger: 'border-danger/40 bg-danger/15 text-[#ffb3bf]',
  }
  return (
    <p className={`rounded-[2px] border px-3.5 py-2.5 text-sm font-semibold ${tones[tone]}`}>{children}</p>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return <Notice tone="danger">{message}</Notice>
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
    <div className="rounded-[2px] border border-dashed border-white/25 bg-surface px-6 py-14 text-center">
      <h3 className="font-display text-lg font-extrabold text-white">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-brand-100">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[2px] bg-white/10 ${className}`} />
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
        <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-brand-100">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Purple page band used at the top of every full page, so section headers read
 *  the same across store, cart, checkout, account and back-office. */
export function PageBand({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="bg-brand-600 py-8 text-white">
      <div className="container-page">
        {eyebrow && <p className="label-caps text-brand-200">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-[2rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium text-brand-100">{subtitle}</p>}
        {children}
      </div>
    </header>
  )
}
