import { api, queryString } from '@/api/client'
import type {
  AdminBlock,
  AdminProduct,
  AdminOrder,
  AdminUser,
  Cart,
  CatalogQuery,
  HomepageBlock,
  MerchantKey,
  MerchantOffer,
  MerchantSale,
  MerchantStats,
  Meta,
  Order,
  Paged,
  ProductCard,
  ProductDetail,
  ProductRequest,
  SalesSummary,
  SearchSuggestion,
  Ticket,
  TicketThread,
  User,
} from '@/api/types'

/** One function per endpoint. Pages never build URLs themselves. */

export const catalogApi = {
  meta: () => api.get<Meta>('/api/meta'),
  homepage: () => api.get<{ blocks: HomepageBlock[] }>('/api/homepage'),
  products: (query: CatalogQuery, signal?: AbortSignal) =>
    api.get<Paged<ProductCard>>(`/api/products${queryString({ ...query })}`, signal),
  product: (slug: string) => api.get<ProductDetail>(`/api/products/${slug}`),
  search: (term: string, signal?: AbortSignal) =>
    api.get<{ query: string; items: SearchSuggestion[] }>(
      `/api/search${queryString({ q: term })}`,
      signal,
    ),
}

export const authApi = {
  me: () => api.get<{ user: User | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    api.post<{ user: User }>('/api/auth/login', { email, password }),
  register: (email: string, password: string, displayName: string) =>
    api.post<{ user: User; devCode?: string }>('/api/auth/register', {
      email,
      password,
      displayName,
    }),
  verify: (email: string, code: string) =>
    api.post<{ user: User }>('/api/auth/verify', { email, code }),
  resend: (email: string) =>
    api.post<{ status: string; devCode?: string }>('/api/auth/resend', { email }),
  logout: () => api.post<{ status: string }>('/api/auth/logout'),
}

type CartLinePayload = { offerId: number; quantity: number }

export const cartApi = {
  get: () => api.get<Cart>('/api/cart'),
  // Guests: the server prices the browser-held cart without storing it.
  preview: (items: CartLinePayload[]) => api.post<Cart>('/api/cart/preview', { items }),
  // Signing in: fold that cart into the account cart.
  merge: (items: CartLinePayload[]) => api.post<Cart>('/api/cart/merge', { items }),
  add: (offerId: number, quantity = 1) => api.post<Cart>('/api/cart', { offerId, quantity }),
  setQuantity: (offerId: number, quantity: number) =>
    api.patch<Cart>(`/api/cart/${offerId}`, { quantity }),
  remove: (offerId: number) => api.delete<Cart>(`/api/cart/${offerId}`),
  clear: () => api.delete<Cart>('/api/cart'),
}

export const orderApi = {
  checkout: (cardNumber: string, idempotencyKey: string) =>
    api.post<{ order: Order; replayed: boolean }>('/api/checkout', { cardNumber }, {
      'Idempotency-Key': idempotencyKey,
    }),
  list: () => api.get<{ orders: Order[] }>('/api/orders'),
  get: (id: number) => api.get<Order>(`/api/orders/${id}`),
  // Keys are disclosed one line at a time, on the buyer's explicit request.
  revealKeys: (orderId: number, itemId: number) =>
    api.post<{ keys: string[]; displayedAt: string | null }>(
      `/api/orders/${orderId}/items/${itemId}/reveal`,
      {},
    ),
  refundItem: (orderId: number, itemId: number) =>
    api.post<{ order: Order }>(`/api/orders/${orderId}/items/${itemId}/refund`, {}),
}

export const merchantApi = {
  stats: () => api.get<MerchantStats>('/api/merchant/stats'),
  offers: () => api.get<{ offers: MerchantOffer[] }>('/api/merchant/offers'),
  saveOffer: (payload: {
    productId: number
    platformSlug: string
    regionCode: string
    priceCents: number
    basePriceCents?: number | null
    isActive?: boolean
  }) => api.post<{ offerId: number; offers: MerchantOffer[] }>('/api/merchant/offers', payload),
  keys: (offerId: number, status = '') =>
    api.get<{ keys: MerchantKey[] }>(`/api/merchant/offers/${offerId}/keys${queryString({ status })}`),
  deleteKeys: (offerId: number, ids: number[]) =>
    api.post<{ deleted: number; offers: MerchantOffer[] }>(`/api/merchant/offers/${offerId}/keys/delete`, { ids }),
  uploadKeys: (offerId: number, bulk: string) =>
    api.post<{ inserted: number; skipped: number; offers: MerchantOffer[] }>(
      `/api/merchant/offers/${offerId}/keys`,
      { bulk },
    ),
  sales: () => api.get<{ sales: MerchantSale[] }>('/api/merchant/sales'),
  products: (term: string) =>
    api.get<Paged<ProductCard>>(`/api/merchant/products${queryString({ q: term })}`),
  requests: () => api.get<{ requests: ProductRequest[] }>('/api/merchant/requests'),
  createRequest: (payload: {
    title: string
    description: string
    coverUrl: string
    platformSlug: string
    regionCode: string
    contentType: string
  }) => api.post<{ request: ProductRequest }>('/api/merchant/requests', payload),
}

export const adminApi = {
  users: (term = '') => api.get<{ users: AdminUser[] }>(`/api/admin/users${queryString({ q: term })}`),
  setRole: (userId: number, role: string) =>
    api.patch<{ user: AdminUser }>(`/api/admin/users/${userId}/role`, { role }),
  requests: (status = '') =>
    api.get<{ requests: ProductRequest[] }>(`/api/admin/requests${queryString({ status })}`),
  reviewRequest: (id: number, approve: boolean, note: string) =>
    api.post<{ request: ProductRequest }>(`/api/admin/requests/${id}/review`, { approve, note }),
  summary: () => api.get<SalesSummary>('/api/admin/summary'),
  catalog: (term = '') => api.get<{ products: AdminProduct[] }>(`/api/admin/catalog${queryString({ q: term })}`),
  updateProduct: (id: number, payload: {
    title: string
    description: string
    coverUrl: string
    heroUrl: string
    developer: string
    publisher: string
    releaseDate: string
    contentType: string
    isActive: boolean
    genres: string[]
  }) => api.patch<{ product: AdminProduct }>(`/api/admin/catalog/${id}`, payload),
  orders: () => api.get<{ orders: AdminOrder[] }>('/api/admin/orders'),
  tickets: (status = '') => api.get<{ tickets: Ticket[] }>(`/api/admin/tickets${queryString({ status })}`),
  setTicketStatus: (id: number, status: string) =>
    api.patch<{ status: string }>(`/api/admin/tickets/${id}`, { status }),
  blocks: () => api.get<{ blocks: AdminBlock[] }>('/api/admin/blocks'),
  // Store cards for a hand-picked product list, used by the homepage preview.
  blockCards: (ids: number[]) =>
    api.get<{ cards: ProductCard[] }>(`/api/admin/catalog/cards${queryString({ ids: ids.join(",") })}`),
  updateBlock: (
    id: number,
    payload: {
      key: string
      type: string
      title: string
      subtitle: string
      config: Record<string, unknown>
      position: number
      isVisible: boolean
      productIds: number[]
    },
  ) => api.patch<{ block: AdminBlock }>(`/api/admin/blocks/${id}`, payload),
  createBlock: (payload: {
    key: string
    type: string
    title: string
    subtitle: string
    config: Record<string, unknown>
    position: number
    isVisible: boolean
    productIds: number[]
  }) => api.post<{ block: AdminBlock }>('/api/admin/blocks', payload),
  deleteBlock: (id: number) => api.delete<void>(`/api/admin/blocks/${id}`),
}

export const ticketApi = {
  list: () => api.get<{ tickets: Ticket[] }>('/api/tickets'),
  create: (payload: {
    subject: string
    body: string
    category: Ticket['category']
    orderId?: number
  }) => api.post<{ status: string }>('/api/tickets', payload),
  thread: (id: number) => api.get<{ thread: TicketThread }>(`/api/tickets/${id}`),
  reply: (
    id: number,
    payload: { body: string; attachments: { mime: string; data: string }[] },
  ) => api.post<{ thread: TicketThread }>(`/api/tickets/${id}/messages`, payload),
  attachmentUrl: (attachmentId: number) => `/api/tickets/attachments/${attachmentId}`,
}
