import { Loader2, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="size-5 animate-spin text-accent" />
    </div>
  )
}

/** UX only: the API independently rejects unauthenticated requests. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullPageSpinner />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}

/** UX only: hiding admin screens is not the security control; the API enforces the role. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <ShieldOff className="size-7 text-accent" aria-hidden />
        <h1 className="mt-4 text-xl font-medium">Administrator access required</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Your account does not have permission to view this page. The server also rejects these requests, and the
          attempt is recorded in the audit log.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    )
  }
  return <>{children}</>
}
