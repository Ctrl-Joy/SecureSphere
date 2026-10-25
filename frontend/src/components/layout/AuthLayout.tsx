import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DataStream } from '@/components/brand/DataStream'
import { Logo } from '@/components/brand/Logo'

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link to="/" className="w-fit" aria-label="SecureSphere home">
          <Logo />
        </Link>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
          <h1 className="mt-3 text-[32px] font-medium leading-tight tracking-tight">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-sm text-muted">{footer}</div> : null}
        </main>
        <p className="font-mono text-[11px] text-subtle">Sessions use HttpOnly cookies. Nothing sensitive is stored in your browser.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border lg:block" aria-hidden>
        <DataStream className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/80 to-transparent p-12 pt-32">
          <p className="max-w-md text-2xl font-medium leading-snug">
            Every sign-in is rate limited, hashed with Argon2id and written to an audit trail.
          </p>
        </div>
      </aside>
    </div>
  )
}
