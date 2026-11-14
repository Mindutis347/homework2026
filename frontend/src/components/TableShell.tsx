import type { ReactNode } from 'react'

/**
 * Wide tables on a phone. The table keeps its columns (a back-office needs them),
 * so the shell says so: the container scrolls sideways, a fade on the right edge
 * shows there is more, and a line of text spells it out for anyone who does not
 * think to swipe. Above `sm` the hint disappears — a laptop needs no coach.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="relative">
        <div className="overflow-x-auto">{children}</div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent sm:hidden"
        />
      </div>
      <p className="px-4 py-2 text-xs text-brand-300 sm:hidden">
        Swipe the table sideways for the remaining columns.
      </p>
    </div>
  )
}
