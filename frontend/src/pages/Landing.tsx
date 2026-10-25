import {
  Activity,
  ArrowRight,
  Database,
  FlaskConical,
  Globe,
  KeyRound,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataStream } from '@/components/brand/DataStream'
import { Footer } from '@/components/layout/Footer'
import { PublicNav } from '@/components/layout/PublicNav'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

// Facts about this codebase, not marketing figures.
const STATS = [
  { value: '60+', label: 'Security tests' },
  { value: '30m', label: 'Idle timeout' },
  { value: 'Argon2id', label: 'Password hashing' },
]

const FEATURES: { icon: LucideIcon; title: string; body: string; points: string[] }[] = [
  {
    icon: KeyRound,
    title: 'Authentication',
    body: 'Server-managed sessions instead of tokens in browser storage. Credentials are hashed with Argon2id and never logged.',
    points: ['HttpOnly, SameSite session cookies', 'Idle + absolute expiry, rotation on login', 'Lockout and rate limiting'],
  },
  {
    icon: ShieldCheck,
    title: 'Access control',
    body: 'Roles are read from the database on every request. Authorization is enforced by the API, not by hidden buttons.',
    points: ['Deny-by-default routers', 'Ownership-scoped queries (no IDOR)', 'Mass-assignment safe schemas'],
  },
  {
    icon: Activity,
    title: 'Monitoring',
    body: 'Security-relevant actions write to an append-only audit trail with severity, outcome and a request correlation ID.',
    points: ['Sanitised metadata, truncated IPs', 'Admin-only global visibility', 'Retention policy built in'],
  },
  {
    icon: FlaskConical,
    title: 'Security testing',
    body: 'Automated tests replay real attacks: CSRF, SQL injection, privilege escalation, session replay and brute force.',
    points: ['Pytest + HTTPX backend suite', 'Static analysis and dependency audit', 'Interactive vulnerability lab'],
  },
]

const PIPELINE: { icon: LucideIcon; name: string; detail: string; controls: string[] }[] = [
  { icon: Globe, name: 'Browser', detail: 'React SPA', controls: ['No tokens in storage', 'Escaped rendering', 'Strict CSP'] },
  { icon: Server, name: 'Edge proxy', detail: 'nginx · TLS', controls: ['HTTPS + HSTS', 'Security headers', 'Body size limits'] },
  { icon: ShieldCheck, name: 'API', detail: 'FastAPI', controls: ['CSRF verification', 'Session + role checks', 'Validation, rate limits'] },
  { icon: Database, name: 'Data', detail: 'PostgreSQL', controls: ['Parameterised SQL', 'Hashed tokens only', 'Audit trail'] },
]

export function LandingPage() {
  const { user } = useAuth()
  const primary = user ? { to: '/dashboard', label: 'Open console' } : { to: '/register', label: 'Secure system' }

  return (
    <div className="min-h-dvh bg-bg">
      <PublicNav />
      <main>
        {/* Hero */}
        <section className="relative isolate flex min-h-[min(100dvh,860px)] items-center overflow-hidden">
          <div
            className="absolute inset-y-0 right-0 -z-10 w-full md:w-[58%] [mask-image:linear-gradient(to_right,transparent,black_28%)] max-md:opacity-40"
            aria-hidden
          >
            <DataStream />
          </div>
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-32 sm:px-8 lg:px-12">
            <div className="max-w-[640px]">
              <h1 className="text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[1.08] tracking-[-0.02em] text-fg">
                Security built into every system layer
              </h1>
              <p className="mt-7 max-w-[400px] font-mono text-[14px] leading-relaxed text-fg/80">
                Engineered to stay resilient, controlled, and uncompromised under pressure.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <Button asChild size="lg" className="px-4">
                  <Link to={primary.to}>
                    {primary.label}
                    <ArrowRight />
                  </Link>
                </Button>
                {!user ? (
                  <Link to="/login" className="font-mono text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
                    Sign in →
                  </Link>
                ) : null}
              </div>
            </div>

            <dl className="mt-24 grid max-w-xl grid-cols-3 sm:mt-32">
              {STATS.map((s, i) => (
                <div key={s.label} className={i === 0 ? 'pr-4 sm:pr-8' : 'border-l border-border-strong px-4 sm:px-8'}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-mono text-lg text-fg sm:text-[22px]">{s.value}</dd>
                  <dd className="mt-2 text-xs text-muted sm:text-[13px]">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-8 border-t border-border">
          <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 lg:px-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Capabilities</p>
                <h2 className="mt-4 text-3xl font-medium leading-tight tracking-tight sm:text-[40px]">
                  Four layers, one consistent security model
                </h2>
              </div>
              <p className="max-w-xl font-mono text-[13px] leading-relaxed text-muted lg:justify-self-end">
                Every control below is implemented and exercised by automated tests. Nothing is simulated in the
                core flows: sign up, sign in, and see each event land in your own audit log.
              </p>
            </div>

            <div className="mt-14 grid border-l border-t border-border sm:grid-cols-2 xl:grid-cols-4">
              {FEATURES.map((f, i) => (
                <article key={f.title} className="group flex flex-col border-b border-r border-border p-7 transition-colors hover:bg-surface">
                  <div className="flex items-center justify-between">
                    <f.icon className="size-5 text-accent" aria-hidden />
                    <span className="font-mono text-xs text-subtle">0{i + 1}</span>
                  </div>
                  <h3 className="mt-10 text-xl font-medium">{f.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{f.body}</p>
                  <ul className="mt-6 space-y-2 border-t border-border pt-5">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-2.5 font-mono text-xs text-fg/80">
                        <span className="mt-[5px] size-1.5 shrink-0 bg-accent" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="scroll-mt-8 border-t border-border bg-surface/40">
          <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 lg:px-12">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Request lifecycle</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-[40px]">
              Each hop removes a class of attack
            </h2>

            <ol className="mt-14 grid gap-px bg-border md:grid-cols-4">
              {PIPELINE.map((step, i) => (
                <li key={step.name} className="relative bg-bg p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center border border-border-strong">
                      <step.icon className="size-[18px] text-fg" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[15px] font-medium">{step.name}</p>
                      <p className="font-mono text-xs text-subtle">{step.detail}</p>
                    </div>
                  </div>
                  <ul className="mt-6 space-y-2">
                    {step.controls.map((c) => (
                      <li key={c} className="border-l-2 border-accent/70 pl-3 font-mono text-xs text-muted">
                        {c}
                      </li>
                    ))}
                  </ul>
                  {i < PIPELINE.length - 1 ? (
                    <ArrowRight
                      className="absolute -right-3 top-8 z-10 hidden size-6 bg-bg p-1 text-accent md:block"
                      aria-hidden
                    />
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="mt-6 grid gap-px bg-border sm:grid-cols-3">
              {[
                ['Trust boundary 1', 'Internet → proxy: everything is untrusted input.'],
                ['Trust boundary 2', 'Proxy → API: only forwarded headers from the proxy are honoured.'],
                ['Trust boundary 3', 'API → database: least-privilege credentials, no dynamic SQL.'],
              ].map(([t, d]) => (
                <div key={t} className="bg-bg px-6 py-5">
                  <p className="font-mono text-xs uppercase tracking-wider text-accent">{t}</p>
                  <p className="mt-2 text-sm text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-8 px-4 py-20 sm:px-8 md:flex-row md:items-center lg:px-12">
            <div>
              <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">See the controls working.</h2>
              <p className="mt-3 max-w-lg font-mono text-[13px] text-muted">
                Create an account, then open the security lab to compare vulnerable and secure patterns side by side.
              </p>
            </div>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link to={primary.to}>
                  {user ? 'Open console' : 'Get started'}
                  <ArrowRight />
                </Link>
              </Button>
              {!user ? (
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
