import { Link, NavLink, Outlet } from 'react-router-dom'

import { Button, EmptyState, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/requests', label: 'Catalog requests', end: false },
  { to: '/admin/orders', label: 'Orders & ledger', end: false },
  { to: '/admin/tickets', label: 'Support', end: false },
  { to: '/admin/blocks', label: 'Homepage', end: false },
]

/** Shell for the admin back-office: role gate plus the section tabs. Every
 *  screen underneath loads its own data, so the shell stays presentational. */
export default function AdminLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-6 h-96 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in to open the back-office"
          description="The admin area is only available to signed-in staff accounts."
          action={
            <Link to="/sign-in?next=/admin">
              <Button>Sign in</Button>
            </Link>
          }
        />
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="This area is admin-only"
          description="Your account does not have the admin role. Ask an existing administrator to promote it from the Users screen."
          action={
            <Link to="/store">
              <Button variant="secondary">Back to the store</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <div className="bg-brand-600 text-white">
        <div className="container-page pt-8">
          <p className="label-caps text-brand-200">Back-office</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-[2rem]">Keyforge admin</h1>
          <p className="mt-1 text-sm font-medium text-brand-100">
            Signed in as {user.displayName} ({user.email})
          </p>

          <nav aria-label="Back-office sections" className="mt-5 flex flex-wrap gap-1.5">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `rounded-[2px] px-3.5 py-2 text-sm font-extrabold transition ${
                    isActive
                      ? 'bg-accent-500 text-ink-900'
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

export { AdminLayout }
