import { Activity, ArrowRight, Check, FlaskConical, LayoutDashboard, Moon, Sun, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'

// Every line here is a control the API actually enforces (see README, "Security design").
const CONTROLS: { name: string; detail: string }[] = [
  { name: 'Passwords', detail: 'Argon2id, salted per user' },
  { name: 'Sessions', detail: 'Server-side, HttpOnly cookie' },
  { name: 'Requests', detail: 'CSRF token on every write' },
  { name: 'Access', detail: 'Role checked on each request' },
  { name: 'Abuse', detail: 'Rate limits and account lockout' },
  { name: 'Audit', detail: 'Append-only security events' },
]

const AREAS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LayoutDashboard,
    title: 'Console',
    body: 'Your sessions, sign-in history and an account checklist computed from live data.',
  },
  {
    icon: FlaskConical,
    title: 'Security lab',
    body: 'Five guided lessons that run real requests: injection, XSS, hashing, validation and access control.',
  },
  {
    icon: Activity,
    title: 'Audit log',
    body: 'Administrators review every security event by severity, outcome and date, and manage accounts.',
  },
]

const LESSONS = ['SQL injection', 'Cross-site scripting', 'Password hashing', 'Input validation', 'Authorization']

export function LandingPage() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const primary = user ? { to: '/dashboard', label: 'Open console' } : { to: '/register', label: 'Create account' }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-8">
        <Link to="/" aria-label="SecureSphere home" className="flex h-11 items-center">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          {user ? null : (
            <Button asChild variant="ghost">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 sm:px-8">
        <section className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24">
          <div>
            <p className="text-sm text-accent">Secure web app and security lab</p>
            <h1 className="mt-3 text-[clamp(2.1rem,6vw,3.5rem)] font-medium leading-[1.08] tracking-tight text-fg">
              Security you can see working.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
              A full-stack app with real authentication, access control and an audit trail, plus a lab that shows each
              attack next to its defence.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link to={primary.to}>
                  {primary.label}
                  <ArrowRight />
                </Link>
              </Button>
              {user ? null : (
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface" aria-label="Controls enforced by the API">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <p className="text-sm font-medium text-fg">Controls in force</p>
              <span className="flex items-center gap-2 text-xs text-ok">
                <span className="size-2 rounded-full bg-ok" aria-hidden />
                {CONTROLS.length} of {CONTROLS.length}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {CONTROLS.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-5 py-3">
                  <Check className="size-4 shrink-0 text-ok" aria-hidden />
                  <span className="w-24 shrink-0 text-sm text-fg">{c.name}</span>
                  <span className="min-w-0 text-sm text-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="What is inside" className="grid gap-4 border-t border-border py-12 md:grid-cols-3 lg:py-16">
          {AREAS.map((a) => (
            <div key={a.title} className="rounded-lg border border-border bg-surface p-5">
              <a.icon className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-base font-medium text-fg">{a.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-8 border-t border-border py-12 lg:grid-cols-2 lg:py-16">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-fg">Learn by running it</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Each lesson explains the risk, lets you send a payload, shows what the server did with it, and names the
              defence. Vulnerable code is only ever shown as text.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to={user ? '/lab' : '/register'}>
                {user ? 'Open the lab' : 'Create an account to start'}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
            {LESSONS.map((l, i) => (
              <li key={l} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="w-5 tabular-nums text-subtle">{i + 1}</span>
                <span className="text-fg">{l}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-4 py-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>SecureSphere. A cybersecurity teaching project.</p>
          <p>FastAPI, PostgreSQL, React.</p>
        </div>
      </footer>
    </div>
  )
}
