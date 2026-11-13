import { Link, NavLink, Outlet } from 'react-router-dom'

import { Button, EmptyState, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'

const TABS = [
  { to: '/merchant', label: 'Overview', end: true },
  { to: '/merchant/offers', label: 'Offers & keys', end: false },
  { to: '/merchant/requests', label: 'Catalog requests', end: false },
]

/** Shell for every merchant screen: gate on role, then a shared header + tabs. */
export default function MerchantLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-40" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in to open the merchant portal"
          description="Seller tools are only available to approved merchant accounts."
          action={
            <Link to="/sign-in?next=/merchant">
              <Button>Sign in</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (user.role !== 'merchant' && user.role !== 'admin') {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Merchant access required"
          description="Seller accounts are approved by an administrator — there is no self-signup for the merchant portal. Contact the store team and an admin will promote your verified account to merchant."
        />
      </div>
    )
  }

  const storeName = user.storeName ?? user.displayName

  return (
    <div className="container-page py-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Seller tools</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">
          Merchant portal
        </h1>
        <p className="mt-1 text-sm text-ink-500">{storeName}</p>

        <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-line" aria-label="Merchant sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition ${
                  isActive
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:border-brand-200 hover:text-ink-900'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="pt-8">
        <Outlet />
      </div>
    </div>
  )
}

export { MerchantLayout }
