import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Shows the first few lines of a long description and lets the buyer open the
 * rest. Height-based rather than `line-clamp`, because the description is rich
 * text: headings, lists and paragraphs are block elements, which line clamping
 * does not reliably cut. Collapsed by default so the offer list stays near the
 * top of the page, which is what a key buyer came for.
 */
export function ClampedText({
  children,
  collapsedHeight = 104,
  moreLabel = 'Read more',
  lessLabel = 'Show less',
}: {
  children: ReactNode
  collapsedHeight?: number
  moreLabel?: string
  lessLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setOverflowing(element.scrollHeight > collapsedHeight + 12)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [collapsedHeight, children])

  return (
    <div>
      <div
        ref={ref}
        style={expanded || !overflowing ? undefined : { maxHeight: collapsedHeight }}
        className={expanded || !overflowing ? undefined : 'relative overflow-hidden'}
      >
        {children}
        {!expanded && overflowing && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-brand-600 to-transparent"
          />
        )}
      </div>

      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 text-xs font-extrabold uppercase tracking-wide text-accent-500 hover:underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  )
}
