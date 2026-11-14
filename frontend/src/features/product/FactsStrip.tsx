import type { ReactNode } from 'react'

/**
 * The four facts a key buyer needs before deciding, in the place eneba puts them:
 * directly under the title, above the price. Each one answers a question the
 * listing would otherwise raise — "will it activate here?", "is the seller
 * real?", "when do I get it?", "what if it is a dud?".
 */
export function FactsStrip({
  regionCode,
  regionName,
  platforms,
  delivery,
}: {
  regionCode: string
  regionName: string
  platforms: string[]
  delivery: 'instant' | 'manual'
}) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
      <Fact
        icon={<GlobeIcon />}
        title={regionCode === 'GLOBAL' ? 'Global key' : `${regionName} key`}
        detail={
          regionCode === 'GLOBAL'
            ? 'Activates in any region'
            : `Activates in ${regionName} — check your account region before buying`
        }
      />
      <Fact
        icon={<GamepadIcon />}
        title={platforms.map(platformLabel).join(' · ')}
        detail="Redeem on the platform store, not on Keyforge"
      />
      <Fact
        icon={<BoltIcon />}
        title={delivery === 'instant' ? 'Instant delivery' : 'Manual delivery'}
        detail={
          delivery === 'instant'
            ? 'The key is issued the second your payment clears'
            : 'The seller sends the key from the order page'
        }
      />
      <Fact
        icon={<ShieldIcon />}
        title="Refundable until you display the key"
        detail="Keys stay hidden until you press Display, and refunds are open until then"
      />
    </ul>
  )
}

function Fact({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0 text-accent-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white">{title}</span>
        <span className="hidden text-xs text-brand-200 sm:block">{detail}</span>
      </span>
    </li>
  )
}

function platformLabel(slug: string): string {
  const labels: Record<string, string> = {
    steam: 'Steam',
    playstation: 'PlayStation',
    xbox: 'Xbox',
    nintendo: 'Switch',
    epic: 'Epic Games',
    gog: 'GOG',
  }
  return labels[slug] ?? slug
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function GlobeIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </svg>
  )
}

function GamepadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 12h4M9 10v4M15.5 12h.01M18 10.5h.01" />
      <rect x="2.5" y="7.5" width="19" height="9" rx="4.5" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg {...iconProps}>
      <path d="M13 2 4.5 13.5H11l-1 8.5L19 10h-6.5z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
