import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { Meta } from '@/api/types'
import { Cover } from '@/components/Cover'
import { useAuth } from '@/features/auth/AuthContext'
import { useCart } from '@/features/cart/CartContext'
import { MarketMenu } from '@/components/MarketMenu'
import { formatMoney } from '@/lib/format'
import { SearchBar } from '@/features/search/SearchBar'

/** Two-row storefront chrome, following eneba.com: a brand-purple utility row
 *  with logo, search and account, then a darker row of catalogue links. The
 *  platform links come from the API so the nav reflects what is actually sold. */
export function Header() {
  const { user } = useAuth()
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
            <MarketMenu />

            <CartMenu />

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
  const navigate = useNavigate()
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
          <MenuLink to="/account/wallet" onNavigate={close}>Shop wallet</MenuLink>
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
              void signOut().then(() => navigate('/'))
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

/** Cart icon with a hover preview: what is in the bag, what it costs, and a way
 *  in. It works for guests too, since their cart lives in the browser. */
function CartMenu() {
  const { cart } = useCart()
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  function openNow() {
    if (timer.current) window.clearTimeout(timer.current)
    setOpen(true)
  }

  // A short delay keeps the panel usable while the pointer crosses the gap.
  function closeSoon() {
    timer.current = window.setTimeout(() => setOpen(false), 150)
  }

  return (
    <div
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocusCapture={openNow}
      onBlurCapture={closeSoon}
    >
      <Link
        to="/cart"
        onClick={() => setOpen(false)}
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

      {open && (
        <div
          role="dialog"
          aria-label="Cart preview"
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-[2px] border border-line bg-surface p-3 shadow-raised"
        >
          {cart.items.length === 0 ? (
            <p className="px-1 py-2 text-sm text-brand-100">Your cart is empty.</p>
          ) : (
            <>
              <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {cart.items.map((item) => (
                  <li key={item.offerId} className="flex items-center gap-2">
                    <Cover
                      productId={item.productId}
                      url={item.coverUrl}
                      alt=""
                      sizes="36px"
                      widths={[160]}
                      fallbackWidth={160}
                      loading="lazy"
                      className="h-12 w-9 shrink-0 rounded-[2px] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">{item.title}</p>
                      <p className="truncate text-[0.6875rem] text-brand-200">
                        {item.platformName} · {item.regionCode} · ×{item.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-bold text-accent-500">{formatMoney(item.lineTotalCents)}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
                <span className="text-xs text-brand-200">Total ({cart.itemCount})</span>
                <span className="font-display text-sm font-extrabold text-white">{formatMoney(cart.subtotalCents)}</span>
              </div>

              <Link to="/cart" onClick={() => setOpen(false)} className="mt-2 block">
                <span className="flex h-9 items-center justify-center rounded-[2px] bg-accent-500 text-xs font-extrabold uppercase tracking-wide text-on-accent hover:bg-accent-400">
                  View cart
                </span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
