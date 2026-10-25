import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 text-center">
      <Logo withWordmark={false} />
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-accent">Error 404</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">The address may be mistyped, or the page may have moved.</p>
      <Button asChild variant="outline" className="mt-8">
        <Link to="/">
          <ArrowLeft />
          Back to home
        </Link>
      </Button>
    </div>
  )
}
