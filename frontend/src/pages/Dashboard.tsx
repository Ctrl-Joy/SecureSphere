import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { eventLabel } from '@/components/EventLabel'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, SeverityBadge, Skeleton } from '@/components/ui/misc'
import { get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AuditEvent, DailyCount, DashboardSummary, Page } from '@/lib/types'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

// Stacking order, bottom to top. Colours carry the same meaning as SeverityBadge everywhere.
const SERIES = [
  { key: 'info', label: 'Info', color: 'var(--subtle)' },
  { key: 'low', label: 'Low', color: 'var(--info)' },
  { key: 'medium', label: 'Medium', color: 'var(--warn)' },
  { key: 'high', label: 'High', color: 'var(--danger)' },
] as const

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'alert' }) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-2 text-[28px] font-medium leading-none tabular-nums', tone === 'alert' ? 'text-danger' : 'text-fg')}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-subtle">{hint}</p> : null}
    </div>
  )
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayLabel = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`))
const dayTotal = (d: DailyCount) => d.info + d.low + d.medium + d.high

/** Stacked daily bars drawn with plain elements: no chart library to download or run on a phone. */
function EventChart({ days }: { days: DailyCount[] }) {
  const max = Math.max(1, ...days.map(dayTotal))
  return (
    <figure className="px-4 pb-4 pt-5 sm:px-5">
      <div className="flex h-44 items-end gap-1 border-b border-border sm:gap-2" aria-hidden>
        {days.map((d) => (
          <div
            key={d.date}
            title={`${dayLabel(d.date)}: ${dayTotal(d)} event(s)`}
            className="flex h-full min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-t-sm"
          >
            {SERIES.map((s) =>
              d[s.key] ? <div key={s.key} style={{ height: `${(d[s.key] / max) * 100}%`, background: s.color }} /> : null,
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-subtle" aria-hidden>
        <span>{dayLabel(days[0].date)}</span>
        <span>Peak {max} a day</span>
        <span>{dayLabel(days[days.length - 1].date)}</span>
      </div>
      <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} {days.reduce((n, d) => n + d[s.key], 0)}
          </span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>Security events per UTC day, by severity</caption>
        <thead>
          <tr>
            <th>Date</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th>{d.date}</th>
              {SERIES.map((s) => (
                <td key={s.key}>{d[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardSummary>('/dashboard/summary') })
  const events = useQuery({
    queryKey: ['my-events', 1, 5],
    queryFn: () => get<Page<AuditEvent>>('/audit-events', { page: 1, page_size: 5 }),
  })
  const s = summary.data
  const firstName = user?.name.split(' ')[0] ?? ''
  const failing = s ? s.checklist.filter((c) => !c.ok).length : 0

  return (
    <>
      <PageHeader
        eyebrow={s?.scope === 'admin' ? 'Administrator console' : 'Security console'}
        title={`Welcome back, ${firstName}`}
        description={user?.last_login_at ? `Last sign-in ${formatDateTime(user.last_login_at)}.` : undefined}
        actions={
          <Button asChild variant="outline">
            <Link to="/settings">
              Review account
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      {summary.isError ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        </Card>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4"
          >
            {!s ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-surface p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-4 h-7 w-12" />
                </div>
              ))
            ) : s.scope === 'admin' ? (
              <>
                <Stat label="Users" value={s.total_users} hint={`${s.suspended_users} suspended`} />
                <Stat label="Locked accounts" value={s.locked_users} tone={s.locked_users ? 'alert' : undefined} hint="Temporary lockouts" />
                <Stat label="Events, 7 days" value={s.events_7d} hint="All accounts" />
                <Stat
                  label="High severity, 7 days"
                  value={s.high_severity_7d}
                  tone={s.high_severity_7d ? 'alert' : undefined}
                  hint="To review, not confirmed attacks"
                />
              </>
            ) : (
              <>
                <Stat label="Active sessions" value={s.active_sessions} hint="Signed-in devices" />
                <Stat
                  label="Failed sign-ins, 7 days"
                  value={s.failed_logins_7d}
                  tone={s.failed_logins_7d ? 'alert' : undefined}
                  hint="Against your account"
                />
                <Stat label="Events, 7 days" value={s.events_7d} hint="Your security activity" />
                <Stat label="Password age" value={`${s.password_age_days}d`} hint="Since last change" />
              </>
            )}
          </section>

          <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Events, last 14 days"
                description={s?.scope === 'admin' ? 'All accounts, by severity' : 'Your account, by severity'}
              />
              {!s ? (
                <div className="p-5">
                  <Skeleton className="h-52" />
                </div>
              ) : s.daily_events.length === 0 || s.daily_events.every((d) => dayTotal(d) === 0) ? (
                <EmptyState title="No events yet" description="Activity such as sign-ins will appear here." />
              ) : (
                <EventChart days={s.daily_events} />
              )}
            </Card>

            <Card>
              <CardHeader
                title="Account checklist"
                description={!s ? 'Checking your account' : failing ? `${failing} item(s) need attention` : 'All checks passing'}
              />
              <ul className="divide-y divide-border">
                {!s
                  ? Array.from({ length: 3 }, (_, i) => (
                      <li key={i} className="px-5 py-4">
                        <Skeleton className="h-4 w-3/4" />
                      </li>
                    ))
                  : s.checklist.map((c) => (
                      <li key={c.key} className="flex gap-3 px-4 py-3.5 sm:px-5">
                        {c.ok ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Passing" />
                        ) : (
                          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Needs attention" />
                        )}
                        <div>
                          <p className="text-sm text-fg">{c.label}</p>
                          <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                        </div>
                      </li>
                    ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-4 sm:mt-6">
        <CardHeader
          title="Recent activity"
          description="Latest security events on your account"
          action={
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link to="/settings#activity">
                View all
                <ArrowRight />
              </Link>
            </Button>
          }
        />
        {events.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : events.isError ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : events.data.items.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y divide-border">
            {events.data.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{eventLabel(e.event_type)}</p>
                  <p className="truncate text-xs text-subtle">
                    <time dateTime={e.created_at} title={formatDateTime(e.created_at)}>
                      {timeAgo(e.created_at)}
                    </time>
                    {e.ip_prefix ? ` · ${e.ip_prefix}` : ''}
                  </p>
                </div>
                <SeverityBadge severity={e.severity} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
