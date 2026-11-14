/** Types mirroring the Go API's JSON exactly. Kept in one file so a backend
 *  field rename produces a compile error at every usage site. */

export type Platform = { id: number; slug: string; name: string }
export type Region = { id: number; code: string; name: string }
export type Genre = { id: number; slug: string; name: string }

export type Meta = {
  platforms: Platform[]
  regions: Region[]
  genres: Genre[]
  priceRange: { minCents: number; maxCents: number }
}

export type ProductCard = {
  id: number
  slug: string
  title: string
  coverUrl: string
  releaseDate: string | null
  popularity: number
  minPriceCents: number
  maxPriceCents: number
  offerCount: number
  /** full = base game, dlc = add-on only, both = base game plus its DLC. */
  contentType: "full" | "dlc" | "both"
  platforms: string[]
  regions: string[]
  bestDiscountPercent: number
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number }

export type Seller = {
  id: number
  storeName: string
  rating: number
  ratingCount: number
  salesCount: number
}

export type Offer = {
  id: number
  priceCents: number
  stock: number
  delivery: 'instant' | 'manual'
  platformSlug: string
  platformName: string
  regionCode: string
  regionName: string
  seller: Seller
}

export type ProductDetail = ProductCard & {
  description: string
  contentType: "full" | "dlc" | "both"
  heroUrl: string
  developer: string
  publisher: string
  genres: string[]
  offers: Offer[]
}

export type HomepageBlock = {
  id: number
  key: string
  type: 'hero' | 'product_carousel' | 'category_tiles' | 'banner' | 'platform_strip'
  title: string
  subtitle: string
  config: Record<string, unknown>
  position: number
  isVisible: boolean
  products: ProductCard[]
}

/** Admin block payload. The editor works from linked product ids; the hydrated
 *  `products` cards are only filled in by the public homepage endpoint. */
export type AdminBlock = Omit<HomepageBlock, 'products'> & { productIds: number[] }

export type SearchSuggestion = {
  slug: string
  title: string
  coverUrl: string
  score: number
}

export type User = {
  id: number
  email: string
  displayName: string
  role: 'customer' | 'merchant' | 'admin'
  isVerified: boolean
  createdAt: string
  storeName?: string
}

export type CartItem = {
  offerId: number
  productId: number
  slug: string
  title: string
  coverUrl: string
  platformSlug: string
  platformName: string
  regionCode: string
  sellerStore: string
  unitPriceCents: number
  quantity: number
  stock: number
  lineTotalCents: number
}

export type Cart = { items: CartItem[]; itemCount: number; subtotalCents: number }

/** A delivered key as the API describes it: the code itself is only ever sent by
 *  the reveal endpoint, so list payloads carry metadata and nothing else. */
export type OrderKey = {
  id: number
  displayedAt: string | null
}

export type OrderItem = {
  id: number
  productId: number
  productSlug: string
  productTitle: string
  coverUrl: string
  platformName: string
  regionCode: string
  sellerStore: string
  unitPriceCents: number
  quantity: number
  commissionCents: number
  sellerPayoutCents: number
  keys: OrderKey[]
  refunded: boolean
  refundable: boolean
  displayedAt: string | null
}

export type Order = {
  id: number
  reference: string
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  subtotalCents: number
  totalCents: number
  currency: string
  paymentMethod: string
  createdAt: string
  paidAt: string | null
  items: OrderItem[]
}

export type MerchantOffer = {
  id: number
  productId: number
  productSlug: string
  productTitle: string
  coverUrl: string
  platformSlug: string
  platformName: string
  regionCode: string
  priceCents: number
  basePriceCents: number | null
  stock: number
  availableKeys: number
  soldKeys: number
  isActive: boolean
  updatedAt: string
}

export type MerchantSale = {
  orderReference: string
  productTitle: string
  quantity: number
  unitPriceCents: number
  payoutCents: number
  soldAt: string
}

export type MerchantStats = {
  offers: number
  activeOffers: number
  keysAvailable: number
  keysSold: number
  revenueCents: number
  payoutCents: number
}

export type ProductRequest = {
  id: number
  merchantId: number
  merchantName: string
  title: string
  platformSlug: string
  regionCode: string
  coverUrl: string
  description: string
  contentType: 'full' | 'dlc' | 'both'
  status: 'pending' | 'approved' | 'rejected'
  adminNote: string
  productSlug: string | null
  createdAt: string
  reviewedAt: string | null
}

export type AdminUser = {
  id: number
  email: string
  displayName: string
  role: 'customer' | 'merchant' | 'admin'
  isVerified: boolean
  storeName?: string
  orders: number
  spentCents: number
  createdAt: string
}

export type SalesSummary = {
  orders: number
  unitsSold: number
  grossCents: number
  commissionCents: number
  payoutCents: number
  avgOrderCents: number
  activeSellers: number
  topSellers: { storeName: string; unitsSold: number; revenueCents: number; commissionCents: number }[]
  daily: { day: string; orders: number; revenueCents: number }[]
}

export type Ticket = {
  id: number
  userEmail: string
  userName: string
  orderReference?: string
  subject: string
  body: string
  category: 'refund' | 'delivery' | 'account' | 'other'
  status: 'open' | 'in_progress' | 'resolved'
  refundRequested: boolean
  createdAt: string
}

/** A picture on a ticket message; the bytes come from /api/tickets/attachments/{id}. */
export type TicketAttachment = {
  id: number
  mime: string
  bytes: number
}

export type TicketMessage = {
  id: number
  authorRole: 'customer' | 'staff'
  authorName: string
  body: string
  createdAt: string
  attachments: TicketAttachment[]
}

export type TicketThread = {
  ticket: Ticket
  messages: TicketMessage[]
}

export type AdminOrder = {
  reference: string
  buyerEmail: string
  status: string
  totalCents: number
  items: number
  createdAt: string
}

export type CatalogQuery = {
  q?: string
  /** Repeatable: several platforms/regions/genres narrow the catalogue to any of them. */
  platform?: string[]
  region?: string[]
  genre?: string[]
  contentType?: string[]
  minPriceCents?: number
  maxPriceCents?: number
  sort?: string
  page?: number
  pageSize?: number
}

/** A catalogue entry as the back-office edits it. */
export type AdminProduct = {
  id: number
  slug: string
  title: string
  description: string
  coverUrl: string
  heroUrl: string
  developer: string
  publisher: string
  releaseDate: string | null
  contentType: "full" | "dlc" | "both"
  isActive: boolean
  genres: string[]
  offerCount: number
  minPriceCents: number
}
