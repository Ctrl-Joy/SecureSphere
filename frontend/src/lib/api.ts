/**
 * Centralised API client.
 *
 * Authentication uses an HttpOnly session cookie the browser sends automatically; this
 * code never sees or stores it. The CSRF token is kept in memory only (never localStorage)
 * and echoed in X-CSRF-Token on state-changing requests.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldError[]
  readonly requestId?: string

  constructor(status: number, code: string, message: string, fields: FieldError[] = [], requestId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.requestId = requestId
  }
}

let csrfToken: string | null = null
let csrfPromise: Promise<string> | null = null
const unauthorizedListeners = new Set<() => void>()

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

async function fetchCsrf(): Promise<string> {
  if (csrfToken) return csrfToken
  csrfPromise ??= fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' })
    .then((r) => r.json() as Promise<{ csrf_token: string }>)
    .then((d) => {
      csrfToken = d.csrf_token
      return d.csrf_token
    })
    .finally(() => {
      csrfPromise = null
    })
  return csrfPromise
}

type Query = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  /** Suppress the global "session expired" handling (used by /auth/me probes and login). */
  silent401?: boolean
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (UNSAFE.has(method)) headers['X-CSRF-Token'] = await fetchCsrf()

  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection.')
  }

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const err = data?.error ?? {}
    const apiErr = new ApiError(
      res.status,
      err.code ?? 'http_error',
      err.message ?? `Request failed (${res.status}).`,
      err.fields ?? [],
      err.request_id,
    )
    // Token rotated (e.g. after login elsewhere or expiry): refresh it and retry once.
    if (res.status === 403 && apiErr.code === 'csrf_failed' && !retried) {
      csrfToken = null
      return api<T>(path, opts, true)
    }
    if (res.status === 401 && !opts.silent401) {
      csrfToken = null
      unauthorizedListeners.forEach((l) => l())
    }
    throw apiErr
  }
  return data as T
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query })
export const post = <T>(path: string, body?: unknown, extra?: Partial<RequestOptions>) =>
  api<T>(path, { method: 'POST', body: body ?? {}, ...extra })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
