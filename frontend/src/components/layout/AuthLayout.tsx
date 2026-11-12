import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  /** Kept for callers; the page title already says what the screen is for. */
  eyebrow?: string
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 py-5 sm:px-8">
      <Link to="/" className="flex h-11 w-fit items-center" aria-label="SecureSphere home">
        <Logo />
      </Link>
      <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted">{description}</p> : null}
        <div className="mt-7">{children}</div>
        {footer ? <div className="mt-7 text-sm text-muted">{footer}</div> : null}
      </main>
      <p className="mx-auto max-w-[400px] text-center text-xs text-subtle">
        Sessions use HttpOnly cookies. Nothing sensitive is stored in your browser.
      </p>
    </div>
  )
}
