/**
 * Regions a key can belong to. GLOBAL is a real option, not a synonym for "no
 * preference": choosing it means "only show me keys that activate anywhere".
 */
export const REGIONS = [
  { code: 'EU', label: 'Europe', flag: '🇪🇺' },
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'UK', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'TR', label: 'Turkey', flag: '🇹🇷' },
  { code: 'BR', label: 'Brazil', flag: '🇧🇷' },
  { code: 'GLOBAL', label: 'Global keys only', flag: '🌍' },
] as const

export type RegionCode = (typeof REGIONS)[number]['code']

export const REGION_CODES = REGIONS.map((entry) => entry.code)
