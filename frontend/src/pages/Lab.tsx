import { useMutation } from '@tanstack/react-query'
import { Check, Play, X } from 'lucide-react'
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
        title="Attack and defence, side by side"
        description="Five lessons that send real requests to this API. Vulnerable code is shown as text only and is never executed."
      />
      <div role="tablist" aria-label="Lessons" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-${t.id}-panel`}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors md:h-9',
              tab === t.id
                ? 'border-fg bg-fg font-medium text-bg'
                : 'border-border-strong text-muted hover:border-subtle hover:text-fg',
            )}
          >
            <span className="tabular-nums opacity-60">{i + 1}</span>
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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 px-4 py-5 sm:px-5 md:grid-cols-[190px_minmax(0,1fr)] md:gap-6">
      <h2 className="flex items-center gap-2.5 self-start text-sm font-medium text-fg">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs tabular-nums text-muted">
          {n}
        </span>
        {title}
      </h2>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  )
}

/** Every lesson reads the same way: what this shows, try it, what happened, how it is defended. */
function Lesson({
  owasp,
  shows,
  tryIt,
  result,
  defence,
}: {
  owasp: string
  shows: ReactNode
  tryIt: ReactNode
  result: ReactNode
  defence: ReactNode
}) {
  return (
    <Card className="divide-y divide-border">
      <Step n={1} title="What this shows">
        <div className="text-sm leading-relaxed text-muted">{shows}</div>
        <Badge className="normal-case">OWASP {owasp}</Badge>
      </Step>
      <Step n={2} title="Try it">
        {tryIt}
      </Step>
      <Step n={3} title="What happened">
        {result ?? <p className="text-sm text-subtle">Run the example above to see the result here.</p>}
      </Step>
      <Step n={4} title="How it is defended">
        <div className="text-sm leading-relaxed text-muted">{defence}</div>
      </Step>
    </Card>
  )
}

function Code({ tone, label, children }: { tone: 'bad' | 'good' | 'neutral'; label: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border',
        tone === 'bad' ? 'border-danger/40' : tone === 'good' ? 'border-ok/40' : 'border-border',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium',
          tone === 'bad' ? 'border-danger/40 text-danger' : tone === 'good' ? 'border-ok/40 text-ok' : 'border-border text-muted',
        )}
      >
        {tone === 'bad' ? <X className="size-3.5" aria-hidden /> : tone === 'good' ? <Check className="size-3.5" aria-hidden /> : null}
        {label}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-bg p-3 font-mono text-xs leading-relaxed text-fg">{children}</pre>
    </div>
  )
}

const chip =
  'min-h-11 min-w-11 max-w-full truncate rounded-md border border-border-strong px-3 font-mono text-xs text-muted hover:border-subtle hover:text-fg md:min-h-8 md:min-w-0'

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
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" loading={pending} className="shrink-0">
          {!pending ? <Play /> : null}
          Run
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">Examples</span>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setValue(p)
              onRun(p)
            }}
            className={chip}
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
    <Lesson
      owasp="A03 Injection"
      shows={
        <>
          Building SQL by joining strings lets input rewrite the query. <code className="font-mono text-fg">' OR 1=1 --</code>{' '}
          turns a product search into "return every row", hidden ones included.
        </>
      }
      tryIt={
        <>
          <RunForm
            label="Product search term"
            defaultValue="USB"
            presets={["' OR 1=1 --", "x' UNION SELECT name FROM users --", '%', 'key']}
            onRun={(v) => m.mutate(v)}
            pending={m.isPending}
          />
          {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        </>
      }
      result={
        m.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {m.data.injection_patterns_detected ? <Badge tone="danger" className="normal-case">Injection syntax</Badge> : <Badge className="normal-case">Plain input</Badge>}
              <span className="min-w-0">{m.data.vulnerable_explanation}</span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Code tone="bad" label="Vulnerable: string concatenation (not executed)">
                {m.data.vulnerable_query}
              </Code>
              <Code tone="good" label="Secure: parameterised query (executed)">
                {m.data.safe_query}
                {'\n\n'}params = {JSON.stringify(m.data.safe_parameters)}
              </Code>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
                {m.data.safe_results.length} row(s) returned. Hidden rows are never included.
              </p>
              {m.data.safe_results.length ? (
                <ul className="divide-y divide-border">
                  {m.data.safe_results.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span className="shrink-0 text-xs text-subtle">{r.category}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-sm text-muted">No products match. The payload was treated as literal text.</p>
              )}
            </div>
          </>
        ) : null
      }
      defence={
        <>
          The query and the data travel separately (bound parameters), so input is only ever a value. SQLAlchemy
          parameterises every query here, and <code className="font-mono text-fg">%</code> and{' '}
          <code className="font-mono text-fg">_</code> are escaped in LIKE searches.
        </>
      }
    />
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
    <Lesson
      owasp="A03 Injection (XSS)"
      shows={
        <>
          If user text is inserted into a page as HTML (for example with <code className="font-mono text-fg">innerHTML</code>),
          a script inside it runs as the victim and can act on their behalf.
        </>
      }
      tryIt={
        <>
          <RunForm
            label="Comment text"
            defaultValue="<img src=x onerror=alert(document.cookie)>"
            presets={['<script>alert(1)</script>', '<a href="javascript:alert(1)">click</a>', 'Hello & welcome']}
            onRun={(v) => m.mutate(v)}
            pending={m.isPending}
          />
          {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        </>
      }
      result={
        m.data ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Code tone="bad" label="Vulnerable: innerHTML = input (not executed)">
                {`comment.innerHTML = ${JSON.stringify(m.data.raw)}`}
              </Code>
              <Code tone="good" label="Secure: HTML-encoded output">
                {m.data.html_encoded}
              </Code>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted">Rendered safely by React</p>
              {/* Rendered as a text node: markup is displayed, never interpreted. */}
              <p className="mt-2 break-all text-sm text-fg">{m.data.raw}</p>
              <p className="mt-3 text-xs text-muted">{m.data.explanation}</p>
            </div>
          </>
        ) : null
      }
      defence={
        <>
          Output is encoded for its context. React escapes text by default and this app never uses{' '}
          <code className="font-mono text-fg">dangerouslySetInnerHTML</code>. A strict Content-Security-Policy blocks
          inline scripts as a second layer, and the session cookie is HttpOnly so script cannot read it.
        </>
      }
    />
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
    <Lesson
      owasp="A02 Cryptographic Failures"
      shows={
        <>
          Fast, unsalted hashes such as SHA-256 give the same output for the same password, so leaked hashes fall to
          precomputed tables and billions of guesses per second.
        </>
      }
      tryIt={
        <>
          <FormAlert tone="info">Use a made-up sample. Never type a real password into a demo.</FormAlert>
          <RunForm
            label="Sample password (demo only)"
            defaultValue="correct horse battery staple"
            presets={['password123', 'Tr0ub4dor&3']}
            onRun={(v) => v && m.mutate(v)}
            pending={m.isPending}
            maxLength={64}
          />
          {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        </>
      }
      result={
        m.data ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <Code tone="bad" label={`SHA-256, unsalted, ${m.data.sha256_us} µs`}>
                {m.data.weak_sha256}
                {'\n'}
                {m.data.weak_sha256_again}
              </Code>
              <p className="text-xs text-muted">Hashed twice: identical. One cracked hash cracks every user with that password.</p>
            </div>
            <div className="space-y-2">
              <Code tone="good" label={`Argon2id, ${m.data.argon2_ms} ms`}>
                {m.data.argon2id}
                {'\n'}
                {m.data.argon2id_again}
              </Code>
              <p className="text-xs text-muted">Hashed twice: different salts, different output, and every guess costs time and memory.</p>
            </div>
          </div>
        ) : null
      }
      defence={
        <>
          Argon2id is deliberately slow and memory-hard, and embeds a random salt. Its parameters are stored in the
          hash, so they can be upgraded transparently at the next sign-in.
        </>
      }
    />
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
    <Lesson
      owasp="A04 Insecure Design, A08 Integrity"
      shows={
        <>
          Client-side validation is a convenience: attackers call the API directly. Accepting unknown fields lets them
          set properties they should not control, such as <code className="font-mono text-fg">is_admin</code>.
        </>
      }
      tryIt={
        <>
          <label htmlFor={id} className="block text-sm font-medium text-fg">
            Sign-up request body (username, email, age, plan)
          </label>
          <textarea
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={2000}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-md border border-border-strong bg-bg p-3 font-mono text-base text-fg focus-visible:border-accent focus-visible:outline-none md:text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => run()} loading={m.isPending} className="max-sm:w-full">
              {!m.isPending ? <Play /> : null}
              Validate on server
            </Button>
            <span className="text-xs text-subtle">Examples</span>
            {Object.entries(VALIDATION_PRESETS).map(([name, body]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setText(body)
                  run(body)
                }}
                className={chip}
              >
                {name}
              </button>
            ))}
          </div>
          {parseError ? <FormAlert>{parseError}</FormAlert> : null}
          {m.isError ? <FormAlert>{errorText(m.error)}</FormAlert> : null}
        </>
      }
      result={
        m.data ? (
          m.data.accepted ? (
            <Code tone="good" label="Accepted: normalised payload">
              {JSON.stringify(m.data.normalized, null, 2)}
            </Code>
          ) : (
            <div className="overflow-hidden rounded-md border border-danger/40">
              <p className="border-b border-danger/40 px-3 py-2 text-xs font-medium text-danger">
                Rejected: {m.data.errors.length} problem(s)
              </p>
              <ul className="divide-y divide-border">
                {m.data.errors.map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:gap-3">
                    <code className="shrink-0 font-mono text-xs text-fg sm:w-24">{e.field}</code>
                    <span className="text-muted">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null
      }
      defence={
        <>
          Every request is checked on the server against a strict Pydantic schema: types are not coerced, unknown
          fields are rejected and strings are length-limited. Errors never echo the submitted values.
        </>
      }
    />
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
    <Lesson
      owasp="A01 Broken Access Control"
      shows={
        <>
          Hiding a button is not access control. If the API trusts the client, anyone can call admin endpoints, read
          other users' records by changing an ID, or set their own role.
        </>
      }
      tryIt={
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {probes.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{p.title}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-subtle">{p.request}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => runProbe(p)} loading={running === p.id} className="shrink-0">
                {running !== p.id ? <Play /> : null}
                Send
              </Button>
            </li>
          ))}
        </ul>
      }
      result={
        Object.keys(results).length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {probes
              .filter((p) => results[p.id])
              .map((p) => {
                const r = results[p.id]
                return (
                  <li key={p.id} className="space-y-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.status === 200 ? 'warn' : 'ok'} className="normal-case">
                        {r.status === 200 ? 'Allowed' : 'Blocked'} · {r.status} {r.code}
                      </Badge>
                      <span className="text-sm text-fg">{p.title}</span>
                    </div>
                    <p className="text-xs text-muted">{r.status === 200 ? r.note : p.expectation}</p>
                  </li>
                )
              })}
          </ul>
        ) : null
      }
      defence={
        <>
          Every route is deny-by-default and the role is read from the database on each request. Resource queries
          include the owner's ID, and update schemas only declare fields users may change.
        </>
      }
    />
  )
}
