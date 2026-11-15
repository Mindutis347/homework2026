import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export type SectionTab = { to: string; label: string; end?: boolean }

/**
 * Section menu for the portal shells. The links used to sit directly on the
 * purple band as bare text, which read as a sentence rather than navigation; here
 * they live inside a bordered, filled strip so the group is unmistakably a menu,
 * and the current section is a filled tab instead of a coloured word.
 *
 * The strip scrolls sideways instead of wrapping, so the eight back-office
 * sections stay on one line on a laptop — and on a phone it brings the current
 * tab into view, since it would otherwise start off-screen.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const nav = navRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    // Centre the active tab inside the strip without moving the page itself.
    const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(target, 0), behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="mt-5">
      {/* Below `sm` the strip scrolls, so its own content is masked at both ends:
          the tabs fade to nothing instead of sliding under a translucent overlay,
          which left half-cut labels still legible through the gradient. */}
      <nav
        ref={navRef}
        aria-label={label}
        className="-mx-1 snap-x snap-proximity overflow-x-auto pb-0.5 [mask-image:linear-gradient(to_right,transparent_0,black_32px,black_calc(100%_-_32px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0,black_32px,black_calc(100%_-_32px),transparent_100%)] sm:[mask-image:none] sm:[-webkit-mask-image:none]"
      >
        <ul className="flex w-max min-w-full gap-1 rounded-[2px] border border-white/15 bg-brand-800/60 p-1 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)] backdrop-blur">
          {tabs.map((tab) => (
            <li key={tab.to} className="shrink-0 snap-start scroll-ml-3">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `block rounded-[2px] px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide transition ${
                    isActive
                      ? 'bg-accent-500 text-on-accent shadow-card'
                      : 'text-brand-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
