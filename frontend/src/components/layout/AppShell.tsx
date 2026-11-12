import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Activity, FlaskConical, LayoutDashboard, LogOut, Moon, Settings, Sun, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type Item = { to: string; label: string; short: string; icon: LucideIcon }

const MAIN: Item[] = [
  { to: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/lab', label: 'Security lab', short: 'Lab', icon: FlaskConical },
  { to: '/settings', label: 'Account', short: 'Account', icon: Settings },
]
const ADMIN: Item[] = [
  { to: '/admin/users', label: 'Users', short: 'Users', icon: Users },
  { to: '/admin/monitoring', label: 'Audit log', short: 'Audit', icon: Activity },
]

function useSignOut() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    try {
      await logout()
      toast.success('Signed out.')
      navigate('/login', { replace: true })
    } catch {
      toast.error('Sign out failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return { signOut, busy }
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-sm font-medium uppercase text-fg">
      {name.trim().charAt(0) || '?'}
    </span>
  )
}

function SideNav() {
  const { user } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
      isActive ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
    )
  const render = (items: Item[]) =>
    items.map((i) => (
      <NavLink key={i.to} to={i.to} className={link}>
        <i.icon className="size-4" aria-hidden />
        {i.label}
      </NavLink>
    ))
  return (
    <nav aria-label="Application" className="flex flex-col gap-1">
      {render(MAIN)}
      {user?.role === 'admin' ? (
        <>
          <p className="mb-1 mt-5 px-3 text-xs text-subtle">Administration</p>
          {render(ADMIN)}
        </>
      ) : null}
    </nav>
  )
}

function SidebarUser() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const { signOut, busy } = useSignOut()
  if (!user) return null
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center gap-3 px-1">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{user.name}</p>
          <p className="truncate text-xs text-subtle">{user.email}</p>
        </div>
        {user.role === 'admin' ? <Badge tone="accent">Admin</Badge> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut} loading={busy}>
          {!busy ? <LogOut /> : null}
          Sign out
        </Button>
      </div>
    </div>
  )
}

/** Phone header: account menu with theme and sign-out, reachable with one thumb at the top right. */
function AccountMenu() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const { signOut } = useSignOut()
  if (!user) return null
  const item = 'flex h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-fg outline-none data-[highlighted]:bg-surface-2'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button aria-label="Account menu" className="flex size-11 items-center justify-center rounded-full">
          <Avatar name={user.name} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-lg border border-border-strong bg-surface p-1.5 shadow-2xl"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={item} onSelect={toggle}>
            {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={signOut}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function TabBar() {
  const { user } = useAuth()
  const items = user?.role === 'admin' ? [...MAIN, ...ADMIN] : MAIN
  return (
    <nav
      aria-label="Application"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px]',
              isActive ? 'font-medium text-fg' : 'text-subtle',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-surface-3')}>
                <i.icon className="size-[18px]" aria-hidden />
              </span>
              {i.short}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Link to="/dashboard" className="mb-7 px-2" aria-label="SecureSphere dashboard">
          <Logo />
        </Link>
        <SideNav />
        <div className="mt-auto">
          <SidebarUser />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg px-4 lg:hidden">
        <Link to="/dashboard" className="flex h-11 items-center" aria-label="SecureSphere dashboard">
          <Logo />
        </Link>
        <AccountMenu />
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-6 sm:px-8 lg:py-10">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
