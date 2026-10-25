import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/form'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/misc'
import { get, patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { AccountStatus, AdminUser, Page, Role } from '@/lib/types'
import { useDebounced } from '@/lib/useDebounced'
import { formatDateTime, timeAgo } from '@/lib/utils'

type Action =
  | { kind: 'role'; user: AdminUser; role: Role }
  | { kind: 'status'; user: AdminUser; status: AccountStatus }
  | { kind: 'unlock'; user: AdminUser }

const PAGE_SIZE = 15

function isLocked(u: AdminUser) {
  return Boolean(u.locked_until && new Date(u.locked_until) > new Date())
}

export function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<Action | null>(null)
  const [detail, setDetail] = useState<AdminUser | null>(null)
  const search = useDebounced(q.trim())

  const users = useQuery({
    queryKey: ['admin-users', search, role, status, page],
    queryFn: () => get<Page<AdminUser>>('/admin/users', { q: search, role, status, page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const mutation = useMutation({
    mutationFn: (a: Action) =>
      a.kind === 'unlock'
        ? post<AdminUser>(`/admin/users/${a.user.id}/unlock`)
        : patch<AdminUser>(`/admin/users/${a.user.id}`, a.kind === 'role' ? { role: a.role } : { status: a.status }),
    onSuccess: (updated) => {
      toast.success(`Updated ${updated.email}.`)
      setAction(null)
      setDetail((d) => (d?.id === updated.id ? updated : d))
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="User management"
        description="Change roles and account status. Every change revokes the user's sessions and is written to the audit log."
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              value={q}
              onChange={(e) => resetPage(setQ)(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              maxLength={100}
              className="pl-9"
            />
          </div>
          <Select value={role} onChange={(e) => resetPage(setRole)(e.target.value)} aria-label="Filter by role" className="md:w-40">
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} aria-label="Filter by status" className="md:w-40">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        {users.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.items.length === 0 ? (
          <EmptyState title="No users match these filters" description="Try a different search term or clear the filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="px-5 py-2.5 font-normal">User</th>
                    <th className="px-5 py-2.5 font-normal">Role</th>
                    <th className="px-5 py-2.5 font-normal">Status</th>
                    <th className="px-5 py-2.5 font-normal">Sessions</th>
                    <th className="px-5 py-2.5 font-normal">Last sign-in</th>
                    <th className="px-5 py-2.5 font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-border ${users.isFetching ? 'opacity-70' : ''}`}>
                  {users.data.items.map((u) => {
                    const self = u.id === me?.id
                    return (
                      <tr key={u.id} className="hover:bg-surface-2/60">
                        <td className="px-5 py-3">
                          <button className="text-left" onClick={() => setDetail(u)}>
                            <span className="block text-fg hover:underline">
                              {u.name}
                              {self ? <span className="ml-2 font-mono text-[11px] text-subtle">(you)</span> : null}
                            </span>
                            <span className="block font-mono text-xs text-subtle">{u.email}</span>
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.role}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={u.status === 'active' ? 'ok' : 'warn'}>{u.status}</Badge>
                            {isLocked(u) ? <Badge tone="accent">locked</Badge> : null}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-muted">{u.active_sessions}</td>
                        <td className="px-5 py-3 font-mono text-xs text-muted" title={formatDateTime(u.last_login_at)}>
                          {timeAgo(u.last_login_at)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RowMenu user={u} self={self} onAction={setAction} onView={() => setDetail(u)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={users.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        {detail ? (
          <DialogContent title={detail.name} description={detail.email}>
            <dl className="grid grid-cols-2 gap-px border border-border bg-border text-sm">
              {[
                ['Role', detail.role],
                ['Status', detail.status],
                ['Active sessions', String(detail.active_sessions)],
                ['Failed attempts', String(detail.failed_login_count)],
                ['Locked until', isLocked(detail) ? formatDateTime(detail.locked_until) : 'Not locked'],
                ['Last sign-in', formatDateTime(detail.last_login_at)],
                ['Password changed', formatDateTime(detail.password_changed_at)],
                ['Created', formatDateTime(detail.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface px-3 py-2.5">
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-subtle">{k}</dt>
                  <dd className="mt-0.5 text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 break-all font-mono text-[11px] text-subtle">ID {detail.id}</p>
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => !o && setAction(null)}
        title={action ? confirmTitle(action) : ''}
        description={action ? confirmBody(action) : ''}
        confirmLabel="Confirm"
        tone={action?.kind === 'unlock' || (action?.kind === 'status' && action.status === 'active') ? 'primary' : 'danger'}
        loading={mutation.isPending}
        onConfirm={() => action && mutation.mutate(action)}
      />
    </>
  )
}

function RowMenu({
  user,
  self,
  onAction,
  onView,
}: {
  user: AdminUser
  self: boolean
  onAction: (a: Action) => void
  onView: () => void
}) {
  const item = 'block w-full px-3 py-2 text-left text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${user.email}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 w-52 border border-border-strong bg-surface p-1 shadow-2xl">
          <DropdownMenu.Item className={item} onSelect={onView}>
            View details
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={item}
            disabled={self}
            onSelect={() => onAction({ kind: 'role', user, role: user.role === 'admin' ? 'user' : 'admin' })}
          >
            {user.role === 'admin' ? 'Remove admin role' : 'Make administrator'}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            disabled={self}
            onSelect={() => onAction({ kind: 'status', user, status: user.status === 'active' ? 'suspended' : 'active' })}
          >
            {user.status === 'active' ? 'Suspend account' : 'Reactivate account'}
          </DropdownMenu.Item>
          {isLocked(user) ? (
            <DropdownMenu.Item className={item} onSelect={() => onAction({ kind: 'unlock', user })}>
              Unlock sign-in
            </DropdownMenu.Item>
          ) : null}
          {self ? <p className="px-3 py-2 text-[11px] text-subtle">You cannot change your own role or status.</p> : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function confirmTitle(a: Action) {
  if (a.kind === 'unlock') return `Unlock ${a.user.name}?`
  if (a.kind === 'role') return a.role === 'admin' ? `Grant administrator role?` : 'Remove administrator role?'
  return a.status === 'suspended' ? `Suspend ${a.user.name}?` : `Reactivate ${a.user.name}?`
}

function confirmBody(a: Action) {
  if (a.kind === 'unlock') return 'Clears the temporary lockout so the user can sign in again.'
  if (a.kind === 'role')
    return a.role === 'admin'
      ? `${a.user.email} will gain full administrative access, including user management and audit logs. Their sessions will be revoked.`
      : `${a.user.email} will lose administrative access. Their sessions will be revoked.`
  return a.status === 'suspended'
    ? `${a.user.email} will be signed out everywhere and unable to sign in until reactivated.`
    : `${a.user.email} will be able to sign in again.`
}
