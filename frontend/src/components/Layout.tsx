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

function Footer() {
  const platforms = ['steam', 'playstation', 'xbox', 'nintendo', 'epic', 'gog']

  return (
    <footer className="mt-12 border-t border-line bg-surface">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-extrabold text-brand-600">keyforge</p>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            Digital game keys from verified sellers. Instant delivery, buyer protection and no
            regional guesswork.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Browse</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
            {platforms.map((slug) => (
              <li key={slug}>
                <Link to={`/store?platform=${slug}`} className="hover:text-brand-700">
                  {platformLabel(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Account</p>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
            <li><Link to="/account/orders" className="hover:text-brand-700">Your library</Link></li>
            <li><Link to="/cart" className="hover:text-brand-700">Cart</Link></li>
            <li><Link to="/sign-in" className="hover:text-brand-700">Sign in</Link></li>
            <li><Link to="/sign-up" className="hover:text-brand-700">Create account</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">This is a demo</p>
          <p className="mt-3 text-sm text-ink-500">
            Payments are simulated and every key is a placeholder. Built for the Eneba internship
            assignment.
          </p>
        </div>
      </div>
      <div className="border-t border-line py-4">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <span>© {new Date().getFullYear()} Keyforge</span>
          <span>SIMULATED KEYS ONLY · NO REAL PAYMENTS</span>
        </div>
      </div>
    </footer>
  )
}
