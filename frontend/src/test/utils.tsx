import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { setCsrfToken } from '@/lib/api'
import { AuthProvider } from '@/lib/auth'
import type { MeResponse, User } from '@/lib/types'

export const alice: User = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Alice Example',
  email: 'alice@example.com',
  role: 'user',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
  password_changed_at: '2026-01-01T00:00:00Z',
}

export const me = (user: User = alice): MeResponse => ({
  user,
  csrf_token: 'csrf-session-token',
  session_expires_at: '2030-01-01T00:00:00Z',
})

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown }

export interface MockedFetch {
  calls: { url: string; init: RequestInit }[]
}

/** Routes fetch calls to `handler`, recording each call for assertions. */
export function mockFetch(handler: Handler): MockedFetch {
  const record: MockedFetch = { calls: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      record.calls.push({ url, init })
      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ csrf_token: 'csrf-anon-token' }), { status: 200 })
      }
      const { status, body } = handler(url, init)
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status })
    }),
  )
  return record
}

export const unauthenticated: Handler = (url) =>
  url.endsWith('/auth/me')
    ? { status: 401, body: { error: { code: 'unauthenticated', message: 'Please sign in.' } } }
    : { status: 404, body: {} }

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

export function renderApp(ui: ReactNode, { route = '/', path = '*' } = {}) {
  setCsrfToken(null)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/dashboard" element={<div>Dashboard page</div>} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
