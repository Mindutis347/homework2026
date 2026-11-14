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

/** 502/503/504 from the Vercel proxy almost always mean the free Render
 *  instance is still booting, so a GET is safe to retry after a short wait. */
const RETRYABLE_STATUS = new Set([502, 503, 504])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers } = options
  // Only reads are retried: a mutating call could have already been applied.
  const maxAttempts = method === 'GET' ? 3 : 1

  for (let attempt = 1; ; attempt++) {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        signal,
        // Same-origin in production (Vercel proxies /api), so cookies are
        // first-party and no CORS preflight is needed.
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (cause) {
      if (signal?.aborted) throw cause
      if (attempt < maxAttempts) {
        await sleep(1200 * attempt)
        continue
      }
      throw new ApiClientError(
        0,
        'network_error',
        'Could not reach the server. It may be starting up — try again in a moment.',
      )
    }

    if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
      await sleep(1500 * attempt)
      continue
    }

    if (response.status === 204) {
      return undefined as T
    }

    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const envelope = payload as { error?: { code?: string; message?: string } } | null
      const retryable = RETRYABLE_STATUS.has(response.status)
      throw new ApiClientError(
        response.status,
        envelope?.error?.code ?? 'request_failed',
        retryable
          ? 'The server is starting up after sleeping (free hosting). Give it a few seconds and try again.'
          : (envelope?.error?.message ?? `Request failed with status ${response.status}`),
      )
    }

    return payload as T
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/** Builds `?a=1&b=2`, skipping empty values so filters stay clean. */
export function queryString(params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    // Arrays become repeated parameters (?platform=steam&platform=xbox), which
    // the API accepts alongside the older comma-separated form.
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== '') search.append(key, item)
      }
      continue
    }
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}
