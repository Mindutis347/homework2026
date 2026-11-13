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
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-ink-900 sm:text-3xl">Back-office</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as {user.displayName} ({user.email})
        </p>
      </header>

      <nav aria-label="Back-office sections" className="mb-7 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `rounded-[2px] px-3.5 py-2 text-sm font-bold transition ${
                isActive
                  ? 'bg-brand-600 text-white shadow-card'
                  : 'text-ink-700 hover:bg-brand-50 hover:text-brand-700'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

export { AdminLayout }
