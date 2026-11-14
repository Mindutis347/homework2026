import { useEffect, useState } from 'react'

/**
 * Cover art plus the wide hero art, when the catalogue has one. Two assets is all
 * the data we have, so this is deliberately a two-tile gallery rather than a
 * fake screenshot strip: a click opens the image full size, Escape closes it.
 */
export function MediaGallery({
  coverUrl,
  heroUrl,
  title,
  eager = false,
}: {
  coverUrl: string
  heroUrl?: string
  title: string
  eager?: boolean
}) {
  const [open, setOpen] = useState(false)
  const shots = [coverUrl, heroUrl].filter((url): url is string => Boolean(url) && url !== coverUrl)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${title} artwork`}
        className="block w-full overflow-hidden rounded-card border border-white/20 shadow-raised transition hover:border-accent-500"
      >
        <img
          src={coverUrl}
          alt={title}
          loading={eager ? 'eager' : 'lazy'}
          className="max-h-[30vh] w-full object-cover object-top lg:max-h-none lg:aspect-[3/4]"
        />
      </button>

      {shots.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {shots.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setOpen(true)}
              className="overflow-hidden rounded-[2px] border border-white/15 transition hover:border-accent-500"
            >
              <img src={url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} artwork`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img
            src={shots.length > 0 && heroUrl ? heroUrl : coverUrl}
            alt={title}
            className="max-h-[90vh] w-auto max-w-full rounded-[2px] object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
