/**
 * The only place the app talks to the network.
 *
 * - `VITE_API_URL` points at the Go API (empty in dev so Vite's proxy handles it).
 * - `credentials: 'include'` is required because the session lives in an
 *   httpOnly cookie, so the SPA never touches the token itself.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers } = options

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const envelope = payload as { error?: { code?: string; message?: string } } | null
    throw new ApiClientError(
      response.status,
      envelope?.error?.code ?? 'request_failed',
      envelope?.error?.message ?? `Request failed with status ${response.status}`,
    )
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/** Builds `?a=1&b=2`, skipping empty values so filters stay clean. */
export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}
