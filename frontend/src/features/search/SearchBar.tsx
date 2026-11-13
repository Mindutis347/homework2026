import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { catalogApi } from '@/api/endpoints'
import type { SearchSuggestion } from '@/api/types'
import { formatMoney } from '@/lib/format'

/**
 * Global search with typo tolerance: the backend ranks by trigram similarity, so
 * "eleden ring" still finds Elden Ring. Input is debounced and in-flight
 * requests are aborted on each keystroke.
 */
export function SearchBar({ initialValue = '' }: { initialValue?: string }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState(initialValue)
  const [items, setItems] = useState<SearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searching, setSearching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setItems([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      catalogApi
        .search(trimmed, controller.signal)
        .then((res) => {
          setItems(res.items)
          setOpen(true)
        })
        .catch(() => undefined)
        .finally(() => setSearching(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function submit(termOverride?: string) {
    const value = (termOverride ?? term).trim()
    setOpen(false)
    if (value) navigate(`/store?q=${encodeURIComponent(value)}`)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (event.key === 'Enter') {
      if (active >= 0 && items[active]) {
        setOpen(false)
        navigate(`/products/${items[active].slug}`)
      } else {
        submit()
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2.5 focus-within:border-brand-400 focus-within:bg-surface">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0 text-ink-300" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setActive(-1)
          }}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          type="search"
          placeholder="Search games, platforms, regions…"
          aria-label="Search products"
          className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none"
        />
        {searching && <span className="size-3.5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />}
      </div>

      {open && term.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-line bg-surface shadow-raised">
          {items.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-500">
              No games match “{term.trim()}”. Try a shorter spelling.
            </p>
          ) : (
            <ul>
              {items.map((item, index) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      setOpen(false)
                      navigate(`/products/${item.slug}`)
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                      active === index ? 'bg-brand-50' : 'hover:bg-canvas'
                    }`}
                  >
                    <img src={item.coverUrl} alt="" className="h-12 w-9 rounded object-cover" loading="lazy" />
                    <span className="flex-1 text-sm font-medium text-ink-900">{item.title}</span>
                    <span className="text-xs text-ink-300">{Math.round(item.score * 100)}% match</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => submit()}
            className="w-full border-t border-line bg-canvas px-4 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            See all results for “{term.trim()}”
          </button>
        </div>
      )}
    </div>
  )
}

export function SearchSummary({ term, total }: { term: string; total: number }) {
  return (
    <p className="text-sm text-ink-500">
      {total} result{total === 1 ? '' : 's'} for <span className="font-semibold text-ink-900">“{term}”</span>
      {total > 0 && <span className="ml-2 text-ink-300">· typo-tolerant matching on</span>}
    </p>
  )
}

export function formatFrom(cents: number) {
  return `from ${formatMoney(cents)}`
}
