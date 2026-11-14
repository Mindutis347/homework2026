import { Badge } from '@/components/ui'

/** What a catalogue entry actually contains, so a buyer never has to guess
 *  whether they are buying the base game, an add-on, or both. */
export type ContentType = 'full' | 'dlc' | 'both'

const LABELS: Record<ContentType, string> = {
  full: 'Full game',
  dlc: 'DLC',
  both: 'Game + DLC',
}

const SHORT: Record<ContentType, string> = {
  full: 'Full',
  dlc: 'DLC',
  both: 'Game+DLC',
}

const TONES: Record<ContentType, 'neutral' | 'accent' | 'success'> = {
  full: 'neutral',
  dlc: 'accent',
  both: 'success',
}

function key(type: string): ContentType {
  return type === 'dlc' || type === 'both' ? type : 'full'
}

export function contentTypeLabel(type: string): string {
  return LABELS[key(type)]
}

/** Full-length label, for detail panels and back-office lists. */
export function ContentTypeBadge({ type, className = '' }: { type: string; className?: string }) {
  return (
    <Badge tone={TONES[key(type)]} className={className}>
      {LABELS[key(type)]}
    </Badge>
  )
}

/** Compact marker laid over a product tile, where space is tight. */
export function ContentTypeTag({ type }: { type: string }) {
  const tone = key(type) === 'dlc' ? 'bg-accent-500 text-on-accent' : key(type) === 'both' ? 'bg-mint-400 text-[#0a2e26]' : 'bg-brand-900/90 text-white'
  return (
    <span className={`absolute right-0 top-0 z-10 px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide ${tone}`}>
      {SHORT[key(type)]}
    </span>
  )
}
