import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { Header } from '@/components/Header'
import { platformLabel } from '@/components/ProductCard'

export function Layout() {
  const { pathname } = useLocation()

  // Route changes should start at the top of the page, like a real storefront.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Dark violet footer, matching the eneba.com chrome: link columns on the
 *  brand's deepest surface, then a thin legal bar. */
function Footer() {
  const platforms = ['steam', 'playstation', 'xbox', 'nintendo', 'epic', 'gog']

  return (
    <footer className="mt-16 bg-brand-900 text-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
        <div>
          <p className="font-display text-xl font-extrabold lowercase tracking-tight">
            keyforge<span className="text-accent-500">.</span>
          </p>
          <p className="mt-3 max-w-xs text-sm text-brand-200">
            Digital game keys from verified sellers. Instant delivery, buyer protection and no
            regional guesswork.
          </p>
          <p className="mt-4 inline-flex rounded-[2px] bg-mint-400/15 px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide text-mint-400">
            Instant e-mail delivery
          </p>
        </div>

        <div>
          <p className="label-caps text-brand-300">Browse</p>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-brand-100">
            <li><Link to="/store" className="hover:text-accent-500">All games</Link></li>
            <li><Link to="/store?sort=discount" className="hover:text-accent-500">Best deals</Link></li>
            {platforms.slice(0, 4).map((slug) => (
              <li key={slug}>
                <Link to={`/store?platform=${slug}`} className="hover:text-accent-500">
                  {platformLabel(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-caps text-brand-300">Account</p>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-brand-100">
            <li><Link to="/account/orders" className="hover:text-accent-500">Your library</Link></li>
            <li><Link to="/account/support" className="hover:text-accent-500">Support</Link></li>
            <li><Link to="/cart" className="hover:text-accent-500">Cart</Link></li>
            <li><Link to="/sign-in" className="hover:text-accent-500">Sign in</Link></li>
          </ul>
        </div>

        <div>
          <p className="label-caps text-brand-300">This is a demo</p>
          <p className="mt-3 text-sm text-brand-200">
            Payments are simulated and every key is a placeholder. Built for the Eneba internship
            assignment, styled after eneba.com.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-4 text-xs font-semibold text-brand-300">
          <span>© {new Date().getFullYear()} Keyforge</span>
          <span className="label-caps text-accent-500">Simulated keys · no real payments</span>
          <span>EU · EUR</span>
        </div>
      </div>
    </footer>
  )
}
