import type { ImgHTMLAttributes } from 'react'

/**
 * Cover art through the API's resize endpoint, so a card asks for the pixels it
 * shows instead of a 600x900 original. `sizes` is what makes that real: without
 * it the browser assumes the image fills the viewport and picks the largest
 * candidate, which would defeat the point.
 *
 * Without a product id (a homepage block summary, for instance) it falls back to
 * the original URL, so nothing breaks if a payload lacks the id.
 */
export function Cover({
  productId,
  url,
  sizes,
  widths = [240, 480],
  fallbackWidth = 480,
  ...rest
}: {
  productId?: number
  url: string
  sizes: string
  widths?: number[]
  fallbackWidth?: number
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'>) {
  if (!productId) {
    return <img src={url} sizes={sizes} {...rest} />
  }
  const srcSet = widths.map((width) => `/api/covers/${productId}?w=${width} ${width}w`).join(', ')
  return (
    <img
      src={`/api/covers/${productId}?w=${fallbackWidth}`}
      srcSet={srcSet}
      sizes={sizes}
      {...rest}
    />
  )
}

/**
 * Thumbnail for back-office lists. Same idea as `Cover`, but a product without
 * artwork gets a placeholder box instead of an empty `src` — an empty string is
 * not "no image" to a browser, it means "the current page".
 */
export function CoverThumb({
  productId,
  url,
  className = '',
  label = 'No cover',
}: {
  productId?: number
  url?: string
  className?: string
  label?: string
}) {
  if (!url) {
    return (
      <div className={`grid place-items-center bg-canvas text-center text-[0.6rem] leading-tight text-ink-300 ${className}`}>
        {label}
      </div>
    )
  }
  return (
    <Cover
      productId={productId}
      url={url}
      alt=""
      sizes="80px"
      widths={[160, 240]}
      fallbackWidth={160}
      loading="lazy"
      className={className}
    />
  )
}
