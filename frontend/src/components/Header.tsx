import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Meta } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { SearchBar } from '@/features/search/SearchBar'

/** Two-row storefront chrome, following eneba.com: a brand-purple utility row
 *  with logo, search and account, then a darker row of catalogue links. The
 *  platform links come from the API so the nav reflects what is actually sold. */
export function Header() {
  const { user } = useAuth()
  const { cart } = useCart()
  const location = useLocation()
  const searchTerm = new URLSearchParams(location.search).get('q') ?? ''
  const [meta, setMeta] = useState<Meta | null>(null)

  useEffect(() => {
    catalogApi.meta().then(setMeta).catch(() => undefined)
  }, [])

  const platforms = meta?.platforms.slice(0, 6) ?? []

  return (
    <header className="sticky top-0 z-40 shadow-[0_1px_0_rgb(255_255_255_/_0.08)]">
      <div className="bg-brand-600 text-white">
        <div className="container-page flex h-16 items-center gap-3 sm:gap-5">
          <Link to="/" className="shrink-0 font-display text-[1.4rem] font-extrabold lowercase tracking-tight text-white">
            keyforge<span className="text-accent-500">.</span>
          </Link>

          <div className="hidden w-full max-w-2xl flex-1 md:block">
            <SearchBar key={searchTerm} initialValue={searchTerm} />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span className="hidden items-center gap-1.5 px-2 text-xs font-bold text-brand-100 lg:flex">
              <span aria-hidden className="text-sm leading-none">🇪🇺</span>
              EU · EUR
            </span>

            <Link
              to="/cart"
              className="relative grid size-10 place-items-center text-white hover:text-accent-500"
              aria-label={`Cart, ${cart.itemCount} items`}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 4h2l2.5 11h10L20 7H6" />
                <circle cx="9.5" cy="19" r="1.4" />
                <circle cx="17.5" cy="19" r="1.4" />
              </svg>
              {cart.itemCount > 0 && (
                <span className="absolute right-0 top-0.5 grid min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[0.65rem] font-extrabold leading-4 text-on-accent">
                  {cart.itemCount}
                </span>
              )}
            </Link>

            {user ? <AccountMenu /> : (
              <div className="flex items-center gap-2 text-xs font-bold">
                <Link to="/sign-in" className="px-2 text-white hover:text-accent-500">
                  Log in
                </Link>
                <span aria-hidden className="text-brand-300">|</span>
                <Link
                  to="/sign-up"
                  className="rounded-[2px] bg-accent-500 px-3 py-2 uppercase tracking-wide text-on-accent hover:bg-accent-400"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="container-page pb-3 md:hidden">
          <SearchBar initialValue={searchTerm} />
        </div>
      </div>

      <div className="border-t border-white/10 bg-brand-700 text-white">
        <div className="container-page flex h-11 items-center gap-5 overflow-x-auto text-[0.8125rem] font-bold">
          <NavLink
            to="/store"
            end
            className={({ isActive }) => (isActive ? 'shrink-0 text-accent-500' : 'shrink-0 hover:text-accent-500')}
          >
            All games
          </NavLink>
          {platforms.map((platform) => (
            <NavLink
              key={platform.slug}
              to={`/store?platform=${platform.slug}`}
              className="shrink-0 whitespace-nowrap text-brand-100 hover:text-accent-500"
            >
              {platform.name}
            </NavLink>
          ))}
          <NavLink
            to="/store?sort=discount"
            className="shrink-0 whitespace-nowrap text-brand-100 hover:text-accent-500"
          >
            Deals
          </NavLink>
          {user && (
            <NavLink
              to="/account/support"
              className="ml-auto shrink-0 whitespace-nowrap text-brand-100 hover:text-accent-500"
            >
              Support
            </NavLink>
          )}
        </div>
      </div>
    </header>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  // Open state is keyed to the current location, so any navigation closes the
  // menu without an effect that would re-render on route changes.
  const locationKey = `${location.pathname}${location.search}`
  const [openKey, setOpenKey] = useState<string | null>(null)
  const open = openKey === locationKey
  const close = () => setOpenKey(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape — a <details> element does neither, which is
  // why this is a controlled popover.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpenKey(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenKey(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenKey(open ? null : locationKey)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex cursor-pointer items-center gap-2 rounded-[2px] border border-white/25 px-2.5 py-1.5 text-xs font-bold text-white hover:border-accent-500 hover:text-accent-500"
      >
        <span className="grid size-6 place-items-center rounded-full bg-accent-500 text-xs font-extrabold text-on-accent">
          {user?.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:block">{user?.displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[2px] border border-line bg-surface py-1 text-white shadow-raised"
        >
          <div className="border-b border-line px-4 py-2">
            <p className="truncate text-sm font-bold text-white">{user?.displayName}</p>
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
            <p className="mt-1 label-caps text-accent-500">{user?.role}</p>
          </div>
          <MenuLink to="/account/orders" onNavigate={close}>Your library</MenuLink>
          <MenuLink to="/account/support" onNavigate={close}>Support</MenuLink>
          {(user?.role === 'merchant' || user?.role === 'admin') && (
            <MenuLink to="/merchant" onNavigate={close}>Merchant portal</MenuLink>
          )}
          {user?.role === 'admin' && (
            <MenuLink to="/admin" onNavigate={close}>Admin back-office</MenuLink>
          )}
          {!user?.isVerified && (
            <MenuLink
              to={`/verify?email=${encodeURIComponent(user?.email ?? '')}`}
              onNavigate={close}
            >
              Verify e-mail
            </MenuLink>
          )}
          <button
            onClick={() => {
              close()
              void signOut()
            }}
            className="block w-full px-4 py-2 text-left text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  to,
  children,
  onNavigate,
}: {
  to: string
  children: React.ReactNode
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onNavigate}
      className="block px-4 py-2 text-sm font-semibold text-brand-100 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  )
}
