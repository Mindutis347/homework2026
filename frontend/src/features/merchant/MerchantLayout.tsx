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
    <div>
      <div className="bg-brand-600 text-white">
        <div className="container-page pt-8">
          <p className="label-caps text-brand-200">Seller tools</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-[2rem]">Merchant portal</h1>
          <p className="mt-1 text-sm font-medium text-brand-100">{storeName}</p>

          <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Merchant sections">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `rounded-[2px] px-3.5 py-2 text-sm font-extrabold transition ${
                    isActive
                      ? 'bg-accent-500 text-on-accent'
                      : 'text-brand-100 hover:bg-brand-700 hover:text-white'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="container-page py-8">
        <Outlet />
      </div>
    </div>
  )
}

export { MerchantLayout }
