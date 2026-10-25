import { useMutation } from '@tanstack/react-query'
import { Check, Play, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { FormAlert, Input } from '@/components/ui/form'
import { Badge, Card, PageHeader } from '@/components/ui/misc'
import { ApiError, api, post } from '@/lib/api'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'sqli', label: 'SQL injection' },
  { id: 'xss', label: 'Cross-site scripting' },
  { id: 'hashing', label: 'Password hashing' },
  { id: 'validation', label: 'Input validation' },
  { id: 'authz', label: 'Authorization' },
] as const
type TabId = (typeof TABS)[number]['id']

export function LabPage() {
  const [tab, setTab] = useState<TabId>('sqli')
  const baseId = useId()
  return (
    <>
      <PageHeader
        eyebrow="Security lab"
        title="Vulnerable vs. secure patterns"
        description="Each demo runs against the real API. Vulnerable code is only shown as text and is never executed; the SQL demo uses an isolated in-memory database of fictional products."
      />
      <div role="tablist" aria-label="Lab exercises" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-${t.id}-panel`}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm transition-colors',
              tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-${tab}-panel`} aria-labelledby={`${baseId}-${tab}`}>
        {tab === 'sqli' && <SqlInjectionLab />}
        {tab === 'xss' && <XssLab />}
        {tab === 'hashing' && <HashingLab />}
        {tab === 'validation' && <ValidationLab />}
        {tab === 'authz' && <AuthorizationLab />}
      </div>
    </>
  )
}

function Explainer({ risk, fix, owasp }: { risk: ReactNode; fix: ReactNode; owasp: string }) {
  return (
    <div className="grid gap-px border border-border bg-border md:grid-cols-2">
      <div className="bg-surface p-5">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-accent">
          <ShieldAlert className="size-4" aria-hidden />
          The risk
        </p>
        <div className="mt-2 text-sm leading-relaxed text-muted">{risk}</div>
      </div>
      <div className="bg-surface p-5">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-ok">
          <ShieldCheck className="size-4" aria-hidden />
          The secure implementation
        </p>
        <div className="mt-2 text-sm leading-relaxed text-muted">{fix}</div>
        <p className="mt-3 font-mono text-[11px] text-subtle">OWASP Top 10: {owasp}</p>
      </div>
    </div>
  )
}

function Code({ tone, label, children }: { tone: 'bad' | 'good' | 'neutral'; label: string; children: ReactNode }) {
  return (
    <div className={cn('border', tone === 'bad' ? 'border-accent/40' : tone === 'good' ? 'border-ok/40' : 'border-border')}>
      <p
        className={cn(
          'flex items-center gap-1.5 border-b px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider',
          tone === 'bad' ? 'border-accent/40 text-accent' : tone === 'good' ? 'border-ok/40 text-ok' : 'border-border text-subtle',
        )}
      >
        {tone === 'bad' ? <X className="size-3" aria-hidden /> : tone === 'good' ? <Check className="size-3" aria-hidden /> : null}
        {label}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-bg p-3 font-mono text-xs leading-relaxed text-fg">{children}</pre>
    </div>
  )
}

function RunForm({
  label,
  defaultValue,
  presets,
  onRun,
  pending,
  maxLength = 200,
}: {
  label: string
  defaultValue: string
  presets: string[]
  onRun: (v: string) => void
  pending: boolean
  maxLength?: number
}) {
  const [value, setValue] = useState(defaultValue)
  const id = useId()
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onRun(value)
      }}
    >
      <label htmlFor={id} className="block font-mono text-xs uppercase tracking-wider text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} className="font-mono" />
        <Button type="submit" loading={pending} className="shrink-0">
          {!pending ? <Play /> : null}
          Run
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">Try:</span>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setValue(p)
              onRun(p)
            }}
            className="border border-border-strong px-2 py-1 font-mono text-[11px] text-muted hover:border-accent hover:text-fg"
          >
            {p}
          </button>
        ))}
      </div>
    </form>
  )
}

function errorText(e: unknown) {
  if (e instanceof ApiError && e.status === 429) return 'Lab rate limit reached (60 requests per minute). Wait a moment.'
  return e instanceof Error ? e.message : 'Request failed.'
}

// ---------------------------------------------------------------------------

interface SqlResult {
  vulnerable_query: string
  vulnerable_explanation: string
  safe_query: string
  safe_parameters: string[]
  safe_results: { id: number; name: string; category: string }[]
  injection_patterns_detected: boolean
}

function SqlInjectionLab() {
  const m = useMutation({ mutationFn: (input: string) => post<SqlResult>('/lab/sql-injection', { input }) })
  return (
    <div className="space-y-6">
      <Explainer
        owasp="A03 Injection"
        risk={
          <>
            Building SQL by concatenating user input lets an attacker change the query itself. The payload{' '}
            <code className="font-mono text-fg">' OR 1=1 --</code> turns a product search into "return every row",
            including hidden ones.
          </>
        }
        fix={
          <>
            Send the query and the data separately (bound parameters). The database treats input purely as a value.
            SecureSphere uses SQLAlchemy, which parameterises every query, and escapes <code className="font-mono text-fg">%</code>{' '}
            and <code className="font-mono text-fg">_</code> in LIKE searches.
          </>
        }
      />
      <Card className="space-y-5 p-5">
        <RunForm
          label="Product search term"
          defaultValue="USB"
          presets={["' OR 1=1 --", "x' UNION SELECT name FROM users --", '%', 'key']}
          onRun={(v) => m.mutate(v)}
          pending={m.isPending}
        />
        {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        {m.data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Code tone="bad" label="Vulnerable: string concatenation (not executed)">
                {m.data.vulnerable_query}
              </Code>
              <p className="flex items-start gap-2 text-xs text-muted">
                {m.data.injection_patterns_detected ? <Badge tone="accent">Injection syntax</Badge> : <Badge>Plain input</Badge>}
                <span>{m.data.vulnerable_explanation}</span>
              </p>
            </div>
            <div className="space-y-3">
              <Code tone="good" label="Secure: parameterised query (executed)">
                {m.data.safe_query}
                {'\n\n'}params = {JSON.stringify(m.data.safe_parameters)}
              </Code>
              <div className="border border-border">
                <p className="border-b border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-subtle">
                  Results: {m.data.safe_results.length} row(s), hidden rows never returned
                </p>
                {m.data.safe_results.length ? (
                  <ul className="divide-y divide-border">
                    {m.data.safe_results.map((r) => (
                      <li key={r.id} className="flex justify-between px-3 py-2 text-sm">
                        <span>{r.name}</span>
                        <span className="font-mono text-xs text-subtle">{r.category}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-sm text-muted">No products match. The payload was treated as literal text.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

interface XssResult {
  raw: string
  html_encoded: string
  contains_markup: boolean
  explanation: string
}

function XssLab() {
  const m = useMutation({ mutationFn: (input: string) => post<XssResult>('/lab/xss', { input }) })
  return (
    <div className="space-y-6">
      <Explainer
        owasp="A03 Injection (XSS)"
        risk={
          <>
            If user-controlled text is inserted into a page as HTML (for example with <code className="font-mono text-fg">innerHTML</code>),
            a script inside it runs with the victim's privileges and can act on their behalf.
          </>
        }
        fix={
          <>
            Encode output for its context. React escapes text by default and SecureSphere never uses{' '}
            <code className="font-mono text-fg">dangerouslySetInnerHTML</code>. A strict Content-Security-Policy blocks inline
            scripts as a second layer, and session cookies are HttpOnly so script cannot read them.
          </>
        }
      />
      <Card className="space-y-5 p-5">
        <RunForm
          label="Comment text"
          defaultValue="<img src=x onerror=alert(document.cookie)>"
          presets={['<script>alert(1)</script>', '<a href="javascript:alert(1)">click</a>', 'Hello & welcome']}
          onRun={(v) => m.mutate(v)}
          pending={m.isPending}
        />
        {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        {m.data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Code tone="bad" label="Vulnerable: element.innerHTML = input (not executed)">
              {`comment.innerHTML = ${JSON.stringify(m.data.raw)}`}
            </Code>
            <Code tone="good" label="Secure: HTML-encoded output">
              {m.data.html_encoded}
            </Code>
            <div className="border border-border p-4 lg:col-span-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-subtle">Rendered safely by React</p>
              {/* Rendered as a text node: markup is displayed, never interpreted. */}
              <p className="mt-2 break-all text-sm text-fg">{m.data.raw}</p>
              <p className="mt-3 text-xs text-muted">{m.data.explanation}</p>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

interface HashResult {
  weak_sha256: string
  weak_sha256_again: string
  argon2id: string
  argon2id_again: string
  argon2_ms: number
  sha256_us: number
}

function HashingLab() {
  const m = useMutation({ mutationFn: (sample: string) => post<HashResult>('/lab/password-hashing', { sample }) })
  return (
    <div className="space-y-6">
      <Explainer
        owasp="A02 Cryptographic Failures"
        risk={
          <>
            Fast, unsalted hashes such as SHA-256 produce the same output for the same password, so leaked hashes can be
            cracked with precomputed tables and billions of guesses per second on a GPU.
          </>
        }
        fix={
          <>
            Argon2id is deliberately slow and memory-hard, and embeds a random salt, so identical passwords produce
            different hashes. Parameters are stored in the hash, allowing transparent upgrades on next sign-in.
          </>
        }
      />
      <FormAlert tone="info">Use a made-up sample. Never enter a real password into a demo.</FormAlert>
      <Card className="space-y-5 p-5">
        <RunForm
          label="Sample password (demo only)"
          defaultValue="correct horse battery staple"
          presets={['password123', 'Tr0ub4dor&3']}
          onRun={(v) => v && m.mutate(v)}
          pending={m.isPending}
          maxLength={64}
        />
        {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        {m.data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Code tone="bad" label={`SHA-256, unsalted · ${m.data.sha256_us} µs`}>
                {m.data.weak_sha256}
                {'\n'}
                {m.data.weak_sha256_again}
              </Code>
              <p className="text-xs text-muted">Hashed twice: identical output. One cracked hash cracks every user with that password.</p>
            </div>
            <div className="space-y-3">
              <Code tone="good" label={`Argon2id · ${m.data.argon2_ms} ms`}>
                {m.data.argon2id}
                {'\n'}
                {m.data.argon2id_again}
              </Code>
              <p className="text-xs text-muted">Hashed twice: different salts, different output, and each guess costs real time and memory.</p>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  )
}

interface ValidationResult {
  accepted: boolean
  normalized: Record<string, unknown> | null
  errors: { field: string; message: string }[]
}

const VALIDATION_PRESETS: Record<string, string> = {
  Valid: '{\n  "username": "ada_l",\n  "email": "ada@example.com",\n  "age": 36,\n  "plan": "pro"\n}',
  'Mass assignment': '{\n  "username": "mallory",\n  "email": "m@example.com",\n  "age": 30,\n  "plan": "free",\n  "is_admin": true\n}',
  'Type confusion': '{\n  "username": "Bob!",\n  "email": "not-an-email",\n  "age": "18",\n  "plan": "enterprise"\n}',
}

function ValidationLab() {
  const [text, setText] = useState(VALIDATION_PRESETS['Mass assignment'])
  const [parseError, setParseError] = useState<string | null>(null)
  const m = useMutation({ mutationFn: (body: unknown) => post<ValidationResult>('/lab/validation', body) })
  const id = useId()
  const run = (value = text) => {
    setParseError(null)
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Body must be a JSON object')
      m.mutate(parsed)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }
  return (
    <div className="space-y-6">
      <Explainer
        owasp="A04 Insecure Design · A08 Integrity"
        risk={
          <>
            Client-side validation is a convenience: attackers send requests directly. Accepting unknown fields lets them
            set properties they should not control (for example <code className="font-mono text-fg">is_admin</code>).
          </>
        }
        fix={
          <>
            Every request is validated on the server against a strict Pydantic schema: types are not coerced, unknown
            fields are rejected, and strings are length-limited. Validation errors never echo the submitted values.
          </>
        }
      />
      <Card className="space-y-4 p-5">
        <label htmlFor={id} className="block font-mono text-xs uppercase tracking-wider text-muted">
          Request body: sign-up form schema (username, email, age, plan)
        </label>
        <textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={2000}
          spellCheck={false}
          className="w-full border border-border-strong bg-bg p-3 font-mono text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => run()} loading={m.isPending}>
            {!m.isPending ? <Play /> : null}
            Validate on server
          </Button>
          {Object.entries(VALIDATION_PRESETS).map(([name, body]) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setText(body)
                run(body)
              }}
              className="border border-border-strong px-2 py-1 font-mono text-[11px] text-muted hover:border-accent hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
        {parseError ? <FormAlert>{parseError}</FormAlert> : null}
        {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        {m.data ? (
          m.data.accepted ? (
            <Code tone="good" label="Accepted · normalised payload">
              {JSON.stringify(m.data.normalized, null, 2)}
            </Code>
          ) : (
            <div className="border border-accent/40">
              <p className="border-b border-accent/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-accent">
                Rejected · {m.data.errors.length} problem(s)
              </p>
              <ul className="divide-y divide-border">
                {m.data.errors.map((e, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                    <code className="w-24 shrink-0 font-mono text-xs text-fg">{e.field}</code>
                    <span className="text-muted">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </Card>
    </div>
  )
}

type Probe = { status: number; code: string; note: string }

function AuthorizationLab() {
  const [results, setResults] = useState<Record<string, Probe>>({})
  const [running, setRunning] = useState<string | null>(null)

  const probes = [
    {
      id: 'admin',
      title: 'Call an administrator endpoint',
      request: 'GET /api/v1/admin/users',
      run: () => api('/admin/users', { silent401: true }),
      expectation: 'Regular users receive 403. The attempt is logged as "authz.denied".',
    },
    {
      id: 'idor',
      title: "Revoke a session you don't own",
      request: 'DELETE /api/v1/sessions/{random id}',
      run: () => api(`/sessions/${crypto.randomUUID()}`, { method: 'DELETE', silent401: true }),
      expectation: 'Lookups are scoped to your user ID, so other sessions are indistinguishable from non-existent ones (404).',
    },
    {
      id: 'mass',
      title: 'Promote yourself through the profile endpoint',
      request: 'PATCH /api/v1/profile {"name": "...", "role": "admin"}',
      run: () => api('/profile', { method: 'PATCH', body: { name: 'Lab test', role: 'admin' }, silent401: true }),
      expectation: 'Unknown fields are rejected (422). Roles can only change through the audited admin endpoint.',
    },
  ]

  const runProbe = async (p: (typeof probes)[number]) => {
    setRunning(p.id)
    try {
      await p.run()
      setResults((r) => ({ ...r, [p.id]: { status: 200, code: 'ok', note: 'Request allowed for your role.' } }))
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'error', 'Request failed')
      setResults((r) => ({ ...r, [p.id]: { status: err.status, code: err.code, note: err.message } }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-6">
      <Explainer
        owasp="A01 Broken Access Control"
        risk={
          <>
            Hiding a button is not access control. If the API trusts the client, anyone can call admin endpoints directly,
            read other users' records by changing an ID (IDOR), or set their own role.
          </>
        }
        fix={
          <>
            Every route is deny-by-default and the role is read from the database on each request. Resource queries
            include the owner's ID, and update schemas only declare fields users may change.
          </>
        }
      />
      <Card>
        <ul className="divide-y divide-border">
          {probes.map((p) => {
            const r = results[p.id]
            return (
              <li key={p.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{p.title}</p>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-subtle">{p.request}</p>
                  <p className="mt-1.5 text-xs text-muted">{p.expectation}</p>
                </div>
                <div className="flex items-center gap-3 md:w-72 md:justify-end">
                  {r ? (
                    <span className="text-right">
                      <Badge tone={r.status === 200 ? 'warn' : 'ok'}>
                        {r.status} {r.code}
                      </Badge>
                      <span className="mt-1 block text-[11px] text-subtle">{r.note}</span>
                    </span>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => runProbe(p)} loading={running === p.id}>
                    {running !== p.id ? <Play /> : null}
                    Run
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
