import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { eventLabel } from '@/components/EventLabel'
import { PasswordStrength } from '@/components/PasswordStrength'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field, FormAlert, Input, PasswordInput } from '@/components/ui/form'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SeverityBadge,
  Skeleton,
} from '@/components/ui/misc'
import { del, get, patch, post } from '@/lib/api'
import { ME_KEY, useAuth } from '@/lib/auth'
import type { AuditEvent, MeResponse, Message, Page, SessionInfo, User } from '@/lib/types'
import { describeUserAgent, formatDateTime, timeAgo } from '@/lib/utils'
import { applyServerErrors, nameSchema, newPasswordSchema, PASSWORD_MAX } from '@/lib/validation'

export function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & security" description="Manage your details, password and signed-in devices." />
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileCard />
        <PasswordCard />
      </div>
      <div className="mt-6 space-y-6">
        <SessionsCard />
        <ActivityCard />
      </div>
    </>
  )
}

const profileSchema = z.object({ name: nameSchema })

function ProfileCard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '' },
  })
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (name: string) => patch<User>('/profile', { name }),
    onSuccess: (updated) => {
      qc.setQueryData<MeResponse | null>(ME_KEY, (old) => (old ? { ...old, user: updated } : old))
      qc.invalidateQueries({ queryKey: ['my-events'] })
      toast.success('Profile updated.')
    },
    onError: (e) => setError(applyServerErrors(e, form.setError, ['name'])),
  })

  return (
    <Card id="profile" className="scroll-mt-6">
      <CardHeader title="Profile" description="Your email address is your sign-in identifier and cannot be changed here." />
      <form
        noValidate
        className="space-y-5 p-5"
        onSubmit={form.handleSubmit((v) => {
          setError(null)
          mutation.mutate(v.name)
        })}
      >
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field label="Full name" error={form.formState.errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...form.register('name')} />}
        </Field>
        <Field label="Email">{(p) => <Input {...p} value={user?.email ?? ''} disabled readOnly />}</Field>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] text-subtle">
            Role: <span className="text-fg">{user?.role}</span> · Member since {formatDateTime(user?.created_at)}
          </p>
          <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  )
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password').max(PASSWORD_MAX),
    new_password: newPasswordSchema,
    confirm: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.new_password !== v.current_password, {
    path: ['new_password'],
    message: 'Choose a password different from the current one',
  })

function PasswordCard() {
  const { user, acceptSession } = useAuth()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })
  const mutation = useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) => post<MeResponse>('/auth/change-password', v),
    onSuccess: (me) => {
      acceptSession(me) // the server issued a fresh session and CSRF token
      form.reset()
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['my-events'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Password changed. All other sessions were signed out.')
    },
    onError: (e) => setError(applyServerErrors(e, form.setError, ['current_password', 'new_password'])),
  })

  return (
    <Card id="password" className="scroll-mt-6">
      <CardHeader title="Change password" description="Changing your password signs out every other device." />
      <form
        noValidate
        className="space-y-5 p-5"
        onSubmit={form.handleSubmit(({ current_password, new_password }) => {
          setError(null)
          mutation.mutate({ current_password, new_password })
        })}
      >
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field label="Current password" error={form.formState.errors.current_password?.message}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" {...form.register('current_password')} />}
        </Field>
        <Field
          label="New password"
          error={form.formState.errors.new_password?.message}
          hint={<PasswordStrength password={form.watch('new_password')} email={user?.email} name={user?.name} />}
        >
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('new_password')} />}
        </Field>
        <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('confirm')} />}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  )
}

function SessionsCard() {
  const qc = useQueryClient()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => get<SessionInfo[]>('/sessions') })
  const [target, setTarget] = useState<SessionInfo | 'others' | null>(null)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['sessions'] })
    qc.invalidateQueries({ queryKey: ['my-events'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const revokeOne = useMutation({
    mutationFn: (id: string) => del<Message>(`/sessions/${id}`),
    onSuccess: (r) => {
      toast.success(r.message)
      setTarget(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const revokeOthers = useMutation({
    mutationFn: () => del<Message>('/sessions'),
    onSuccess: (r) => {
      toast.success(r.message)
      setTarget(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const others = sessions.data?.filter((s) => !s.current).length ?? 0

  return (
    <Card id="sessions" className="scroll-mt-6">
      <CardHeader
        title="Active sessions"
        description="Devices currently signed in to your account. IP addresses are truncated for privacy."
        action={
          <Button variant="danger" size="sm" disabled={!others} onClick={() => setTarget('others')}>
            <LogOut />
            Sign out others
          </Button>
        }
      />
      {sessions.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
      ) : (
        <ul className="divide-y divide-border">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <Monitor className="hidden size-5 text-subtle sm:block" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-fg">
                  {describeUserAgent(s.user_agent)}
                  {s.current ? <Badge tone="ok">This device</Badge> : null}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-subtle">
                  {s.ip_prefix ?? 'unknown network'} · signed in {timeAgo(s.created_at)} · active {timeAgo(s.last_seen_at)} ·
                  expires {formatDateTime(s.expires_at)}
                </p>
              </div>
              {!s.current ? (
                <Button variant="outline" size="sm" onClick={() => setTarget(s)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target === 'others' ? 'Sign out all other sessions?' : 'Revoke this session?'}
        description={
          target === 'others'
            ? `${others} other device(s) will be signed out immediately.`
            : 'That device will be signed out immediately and must sign in again.'
        }
        confirmLabel={target === 'others' ? 'Sign out others' : 'Revoke session'}
        loading={revokeOne.isPending || revokeOthers.isPending}
        onConfirm={() => (target === 'others' ? revokeOthers.mutate() : target && revokeOne.mutate(target.id))}
      />
    </Card>
  )
}

function ActivityCard() {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const q = useQuery({
    queryKey: ['my-events', page, pageSize],
    queryFn: () => get<Page<AuditEvent>>('/audit-events', { page, page_size: pageSize }),
    placeholderData: (prev) => prev,
  })
  return (
    <Card id="activity" className="scroll-mt-6">
      <CardHeader title="Recent security activity" description="Sign-ins, password changes and other events on your account." />
      {q.isPending ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No activity recorded yet" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-normal">Event</th>
                  <th className="px-5 py-2.5 font-normal">Severity</th>
                  <th className="px-5 py-2.5 font-normal">Outcome</th>
                  <th className="px-5 py-2.5 font-normal">Network</th>
                  <th className="px-5 py-2.5 font-normal">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-3 text-fg">{eventLabel(e.event_type)}</td>
                    <td className="px-5 py-3">
                      <SeverityBadge severity={e.severity} />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{e.outcome}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{e.ip_prefix ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted" title={formatDateTime(e.created_at)}>
                      {timeAgo(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
    </Card>
  )
}
