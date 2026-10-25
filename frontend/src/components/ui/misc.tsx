import { AlertTriangle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/types'
import { Button } from './button'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border border-border bg-surface', className)} {...props} />
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

const badgeTones = {
  neutral: 'border-border-strong text-muted',
  accent: 'border-accent/50 text-accent bg-accent-soft',
  ok: 'border-ok/40 text-ok bg-ok/10',
  warn: 'border-warn/40 text-warn bg-warn/10',
  info: 'border-info/40 text-info bg-info/10',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: keyof typeof badgeTones
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const severityTone: Record<Severity, keyof typeof badgeTones> = {
  info: 'neutral',
  low: 'info',
  medium: 'warn',
  high: 'accent',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge tone={severityTone[severity]}>
      <span aria-hidden className="size-1.5 bg-current" />
      {severity}
    </Badge>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse bg-surface-3', className)} />
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Inbox className="mb-3 size-6 text-subtle" aria-hidden />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <AlertTriangle className="mb-3 size-6 text-accent" aria-hidden />
      <p className="text-sm font-medium text-fg">Could not load this data</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="font-mono text-xs text-subtle">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="px-2 font-mono text-xs text-muted">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">{eyebrow}</p> : null}
        <h1 className="text-2xl font-medium tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  )
}
