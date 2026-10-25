import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Activity,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type Item = { to: string; label: string; icon: LucideIcon }

const MAIN: Item[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/lab', label: 'Security lab', icon: FlaskConical },
  { to: '/settings', label: 'Account settings', icon: Settings },
]
const ADMIN: Item[] = [
  { to: '/admin/users', label: 'User management', icon: Users },
  { to: '/admin/monitoring', label: 'Security monitoring', icon: Activity },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition-colors',
      isActive ? 'border-accent bg-surface-2 text-fg' : 'border-transparent text-muted hover:bg-surface-2 hover:text-fg',
    )
  const render = (items: Item[]) =>
    items.map((i) => (
      <NavLink key={i.to} to={i.to} className={link} onClick={onNavigate}>
        <i.icon className="size-4" aria-hidden />
        {i.label}
      </NavLink>
    ))
  return (
    <nav aria-label="Application" className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <p className="mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Workspace</p>
        {render(MAIN)}
      </div>
      {user?.role === 'admin' ? (
        <div className="flex flex-col gap-0.5">
          <p className="mb-2 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">Administration</p>
          {render(ADMIN)}
        </div>
      ) : null}
    </nav>
  )
}

function UserPanel() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const onLogout = async () => {
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

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center gap-3 px-1">
        <div className="flex size-9 shrink-0 items-center justify-center border border-border-strong bg-surface-2 font-mono text-sm uppercase">
          {user.name.trim().charAt(0) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{user.name}</p>
          <p className="truncate font-mono text-[11px] text-subtle">{user.email}</p>
        </div>
        <Badge tone={user.role === 'admin' ? 'accent' : 'neutral'}>{user.role}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onLogout} loading={busy}>
          {!busy ? <LogOut /> : null}
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-5 lg:flex">
        <Link to="/" className="mb-8 px-2" aria-label="SecureSphere home">
          <Logo />
        </Link>
        <NavItems />
        <div className="mt-auto">
          <UserPanel />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur lg:hidden">
        <Link to="/dashboard" aria-label="Dashboard">
          <Logo />
        </Link>
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,85vw)] flex-col border-r border-border-strong bg-surface px-3 py-5">
              <div className="mb-8 flex items-center justify-between px-2">
                <DialogPrimitive.Title asChild>
                  <span>
                    <Logo />
                  </span>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Application navigation</DialogPrimitive.Description>
                <DialogPrimitive.Close aria-label="Close navigation" className="text-muted hover:text-fg">
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
              <div className="mt-auto">
                <UserPanel />
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  )
}
