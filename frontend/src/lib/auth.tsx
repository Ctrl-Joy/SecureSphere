import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api, ApiError, onUnauthorized, post, setCsrfToken } from './api'
import type { MeResponse, User } from './types'

interface AuthState {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** Store a MeResponse returned by an endpoint that rotates the session. */
  acceptSession: (me: MeResponse) => void
}

const AuthContext = createContext<AuthState | null>(null)
export const ME_KEY = ['auth', 'me'] as const

async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>('/auth/me', { silent401: true })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: 1 })

  useEffect(() => {
    if (me.data) setCsrfToken(me.data.csrf_token)
  }, [me.data])

  useEffect(
    () =>
      onUnauthorized(() => {
        const wasSignedIn = qc.getQueryData(ME_KEY) != null
        qc.setQueryData(ME_KEY, null)
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
        if (wasSignedIn) toast.error('Your session has ended. Please sign in again.')
      }),
    [qc],
  )

  const acceptSession = useCallback(
    (data: MeResponse) => {
      setCsrfToken(data.csrf_token)
      qc.setQueryData(ME_KEY, data)
    },
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      setCsrfToken(null)
      const data = await post<MeResponse>('/auth/login', { email, password }, { silent401: true })
      acceptSession(data)
      return data.user
    },
    [acceptSession],
  )

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout')
    } finally {
      setCsrfToken(null)
      // Not qc.clear(): that would detach the observer still watching ME_KEY.
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
    }
  }, [qc])

  const value = useMemo<AuthState>(
    () => ({ user: me.data?.user ?? null, isLoading: me.isPending, login, logout, acceptSession }),
    [me.data, me.isPending, login, logout, acceptSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
