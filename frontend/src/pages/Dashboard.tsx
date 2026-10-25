import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleAlert, FlaskConical, KeyRound, MonitorSmartphone, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eventLabel } from '@/components/EventLabel'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, SeverityBadge, Skeleton } from '@/components/ui/misc'
import { get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AuditEvent, DashboardSummary, Page } from '@/lib/types'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

const SERIES = [
  { key: 'info', label: 'Info', color: 'var(--subtle)' },
  { key: 'low', label: 'Low', color: 'var(--info)' },
  { key: 'medium', label: 'Medium', color: 'var(--warn)' },
  { key: 'high', label: 'High', color: 'var(--accent)' },
] as const

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'alert' | 'ok' }) {
  return (
    <div className="bg-surface p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className={cn('mt-3 font-mono text-[28px] leading-none', tone === 'alert' ? 'text-accent' : 'text-fg')}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardSummary>('/dashboard/summary') })
  const events = useQuery({
    queryKey: ['my-events', 1, 6],
    queryFn: () => get<Page<AuditEvent>>('/audit-events', { page: 1, page_size: 6 }),
  })
  const s = summary.data
  const firstName = user?.name.split(' ')[0] ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        eyebrow={s?.scope === 'admin' ? 'Administrator console' : 'Security console'}
        title={`${greeting}, ${firstName}`}
        description={
          user?.last_login_at ? `Last sign-in ${formatDateTime(user.last_login_at)}.` : 'Here is the current state of your account.'
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/settings">
              <KeyRound />
              Security settings
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
          <section aria-label="Summary" className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
            {!s ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-surface p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-4 h-7 w-12" />
                </div>
              ))
            ) : s.scope === 'admin' ? (
              <>
                <Stat label="Total users" value={s.total_users} hint={`${s.suspended_users} suspended`} />
                <Stat label="Locked accounts" value={s.locked_users} tone={s.locked_users ? 'alert' : undefined} hint="Temporary lockouts" />
                <Stat label="Events · 7 days" value={s.events_7d} hint="All accounts" />
                <Stat
                  label="High severity · 7d"
                  value={s.high_severity_7d}
                  tone={s.high_severity_7d ? 'alert' : undefined}
                  hint="Needs review, not confirmed attacks"
                />
              </>
            ) : (
              <>
                <Stat label="Active sessions" value={s.active_sessions} hint="Signed-in devices" />
                <Stat
                  label="Failed sign-ins · 7d"
                  value={s.failed_logins_7d}
                  tone={s.failed_logins_7d ? 'alert' : undefined}
                  hint="Against your account"
                />
                <Stat label="Events · 7 days" value={s.events_7d} hint="Your security activity" />
                <Stat label="Password age" value={`${s.password_age_days}d`} hint="Since last change" />
              </>
            )}
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Security events, last 14 days"
                description={s?.scope === 'admin' ? 'All accounts, by severity (UTC days)' : 'Events on your account, by severity (UTC days)'}
              />
              <div className="h-[280px] px-2 py-4">
                {!s ? (
                  <Skeleton className="mx-4 h-full" />
                ) : s.daily_events.every((d) => d.info + d.low + d.medium + d.high === 0) ? (
                  <EmptyState title="No events yet" description="Activity such as sign-ins will appear here." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.daily_events} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => d.slice(5)}
                        tick={{ fill: 'var(--subtle)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--subtle)', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--surface-2)' }}
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: 0,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--text)', fontFamily: 'JetBrains Mono' }}
                      />
                      <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
                      {SERIES.map((ser) => (
                        <Bar key={ser.key} dataKey={ser.key} name={ser.label} stackId="sev" fill={ser.color} maxBarSize={28} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Account security checklist" description="Computed from your live account data" />
              <ul className="divide-y divide-border">
                {!s
                  ? Array.from({ length: 3 }, (_, i) => (
                      <li key={i} className="px-5 py-4">
                        <Skeleton className="h-4 w-3/4" />
                      </li>
                    ))
                  : s.checklist.map((c) => (
                      <li key={c.key} className="flex gap-3 px-5 py-4">
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Recent activity"
            description="Latest security events on your account"
            action={
              <Button asChild variant="ghost" size="sm">
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
                <li key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <SeverityBadge severity={e.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{eventLabel(e.event_type)}</p>
                    <p className="truncate font-mono text-[11px] text-subtle">
                      {e.event_type}
                      {e.ip_prefix ? ` · ${e.ip_prefix}` : ''}
                    </p>
                  </div>
                  <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="shrink-0 font-mono text-xs text-muted">
                    {timeAgo(e.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid gap-px bg-border">
            {[
              { to: '/settings#sessions', icon: MonitorSmartphone, title: 'Review active sessions', body: 'Sign out devices you do not recognise.' },
              { to: '/settings#password', icon: KeyRound, title: 'Change password', body: 'Rotates every session on your account.' },
              { to: '/lab', icon: FlaskConical, title: 'Open the security lab', body: 'Compare vulnerable and secure patterns.' },
              ...(user?.role === 'admin'
                ? [{ to: '/admin/users', icon: Users, title: 'Manage users', body: 'Roles, suspensions and lockouts.' }]
                : []),
            ].map((a) => (
              <Link key={a.to} to={a.to} className="group flex items-center gap-4 bg-surface px-5 py-4 hover:bg-surface-2">
                <a.icon className="size-4 text-accent" aria-hidden />
                <div className="flex-1">
                  <p className="text-sm text-fg">{a.title}</p>
                  <p className="text-xs text-muted">{a.body}</p>
                </div>
                <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
