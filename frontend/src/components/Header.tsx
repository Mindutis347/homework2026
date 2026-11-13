import { Link, NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { SearchBar } from '@/features/search/SearchBar'

export function Header() {
  const { user } = useAuth()
  const { cart } = useCart()
  const location = useLocation()
  const searchTerm = new URLSearchParams(location.search).get('q') ?? ''

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-3 sm:gap-5">
        <Link to="/" className="shrink-0 font-display text-xl font-extrabold tracking-tight text-brand-600">
          keyforge
        </Link>

        <nav className="hidden items-center gap-4 text-sm font-medium text-ink-700 lg:flex">
          <NavLink to="/store" className={({ isActive }) => (isActive ? 'text-brand-700' : 'hover:text-brand-700')}>
            Store
          </NavLink>
          <NavLink
            to="/store?sort=discount"
            className={() => 'hover:text-brand-700'}
          >
            Deals
          </NavLink>
        </nav>

        <div className="mx-auto hidden w-full max-w-xl md:block">
          <SearchBar key={searchTerm} initialValue={searchTerm} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/cart"
            className="relative grid size-10 place-items-center rounded-full text-ink-700 hover:bg-canvas"
            aria-label={`Cart, ${cart.itemCount} items`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 4h2l2.5 11h10L20 7H6" />
              <circle cx="9.5" cy="19" r="1.4" />
              <circle cx="17.5" cy="19" r="1.4" />
            </svg>
            {cart.itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[0.65rem] font-bold text-ink-900">
                {cart.itemCount}
              </span>
            )}
          </Link>

          {user ? <AccountMenu /> : (
            <div className="flex items-center gap-2">
              <Link to="/sign-in" className="hidden text-sm font-semibold text-ink-700 hover:text-brand-700 sm:block">
                Sign in
              </Link>
              <Link
                to="/sign-up"
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="container-page pb-3 md:hidden">
        <SearchBar initialValue={searchTerm} />
      </div>
    </header>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuth()

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand-200 hover:text-brand-700">
        <span className="grid size-6 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {user?.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:block">{user?.displayName}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-raised">
        <div className="border-b border-line px-4 py-2">
          <p className="truncate text-sm font-semibold text-ink-900">{user?.displayName}</p>
          <p className="truncate text-xs text-ink-500">{user?.email}</p>
          <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-brand-600">{user?.role}</p>
        </div>
        <MenuLink to="/account/orders">Your library</MenuLink>
        {(user?.role === 'merchant' || user?.role === 'admin') && <MenuLink to="/merchant">Merchant portal</MenuLink>}
        {user?.role === 'admin' && <MenuLink to="/admin">Admin back-office</MenuLink>}
        {!user?.isVerified && <MenuLink to={`/verify?email=${encodeURIComponent(user?.email ?? '')}`}>Verify e-mail</MenuLink>}
        <button
          onClick={() => void signOut()}
          className="block w-full px-4 py-2 text-left text-sm text-ink-700 hover:bg-canvas"
        >
          Sign out
        </button>
      </div>
    </details>
  )
}

function MenuLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="block px-4 py-2 text-sm text-ink-700 hover:bg-canvas">
      {children}
    </Link>
  )
}
