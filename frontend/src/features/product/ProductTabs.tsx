import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'offers', label: 'Offers' },
  { id: 'details', label: 'Details' },
] as const

type SectionID = (typeof SECTIONS)[number]['id']

/**
 * Anchor bar for a page that is two or three screens tall. It sticks under the
 * site header on desktop only: on a phone it would eat a fifth of the screen,
 * where the scroll itself is the navigation.
 */
export function ProductTabs({ offerCount }: { offerCount: number }) {
  const [active, setActive] = useState<SectionID>('overview')

  useEffect(() => {
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => Boolean(element),
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = visible?.target.id
        if (id === 'overview' || id === 'offers' || id === 'details') setActive(id)
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: [0.05, 0.3, 0.6] },
    )
    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="Product sections"
      className="sticky top-[6.75rem] z-30 -mx-4 mb-6 hidden border-y border-white/10 bg-brand-600/95 px-4 backdrop-blur lg:block"
    >
      <ul className="flex gap-1">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'true' : undefined}
              className={`inline-block border-b-2 px-3 py-3 text-xs font-extrabold uppercase tracking-wide transition ${
                active === section.id
                  ? 'border-accent-500 text-accent-500'
                  : 'border-transparent text-brand-100 hover:text-white'
              }`}
            >
              {section.label}
              {section.id === 'offers' && offerCount > 0 && (
                <span className="ml-1.5 rounded-[2px] bg-white/15 px-1.5 py-0.5 text-[0.65rem] text-white">
                  {offerCount}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
