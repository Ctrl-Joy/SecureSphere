# SecureSphere

A full-stack web application demonstrating secure software development: database-backed
authentication, server-side sessions, role-based access control, an append-only security
audit trail, and an interactive lab comparing vulnerable and secure code patterns.

Built as a college cybersecurity project, portfolio piece and interview talking point.
Everything in the core flows is real. There are no mocked responses or fake success messages.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI primitives, TanStack Query, React Hook Form + Zod, Recharts |
| Backend | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, Argon2id (argon2-cffi) |
| Data | PostgreSQL 16 (production / Docker); SQLite for zero-setup local development and tests |
| Ops | Docker Compose, nginx (unprivileged), GitHub Actions CI, Ruff, Bandit, pip-audit, npm audit |

---

## Contents

1. [Features](#features)
2. [Quick start (local, no Docker)](#quick-start-local-no-docker)
3. [Quick start (Docker Compose)](#quick-start-docker-compose)
4. [Architecture](#architecture)
5. [Security design](#security-design)
6. [API reference](#api-reference)
7. [Configuration](#configuration)
8. [Testing and verification](#testing-and-verification)
9. [Deployment](#deployment)
10. [Known limitations](#known-limitations)

Further documents: [Threat model](docs/THREAT_MODEL.md) · [Security policy](SECURITY.md)

---

## Features

**Public:** landing page, registration with live password guidance, sign-in, and password reset with single-use emailed links.

**Every signed-in user:**
- **Dashboard:** real metrics, a 14-day security-event chart, a live account checklist and recent activity.
- **Account settings:** edit profile, change password (rotates every session), list and revoke sessions, view personal security activity.
- **Security lab:** SQL injection, XSS, password hashing, input validation and authorization demos running against the real API.

**Administrators:**
- **User management:** search, filter and paginate users; promote or demote; suspend or reactivate; unlock. Every change goes through a confirmation dialog and is audited.
- **Security monitoring:** filterable audit trail (type, severity, outcome, date range) with an event detail view.

---

## Quick start (local, no Docker)

Prerequisites: [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you) and Node.js 20+.

```bash
# 1. Backend
cd backend
uv sync                                   # creates .venv from uv.lock
cp .env.example .env                      # optional; defaults work for development
uv run alembic upgrade head               # creates backend/var/securesphere.db
uv run python -m app.cli create-admin --email admin@example.com --name "Ada Admin"   # prompts for a password
uv run python -m app.cli seed-demo        # optional: 120 sample events, flagged is_sample
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# 2. Frontend (second terminal)
cd frontend
npm ci
npm run dev                               # http://localhost:5173, proxies /api to :8000
```

- **API docs (development only):** http://localhost:8000/api/docs
- **Password-reset emails in development:** written to `backend/var/dev_mail/*.eml`. This outbox is refused when `SS_ENVIRONMENT=production`.

> No default credentials exist anywhere in the code. The only way to create an administrator
> is the `create-admin` command, which applies the same password policy as the API.

## Quick start (Docker Compose)

Runs the **production configuration**: PostgreSQL, one-shot migrations, a non-root API, nginx serving the SPA, and [Mailpit](https://mailpit.axllent.org/) as a local SMTP catcher.

```bash
cp .env.example .env          # replace every placeholder with random values
docker compose up --build
docker compose run --rm -e SS_ADMIN_PASSWORD backend python -m app.cli create-admin --email you@example.com
```

- **App:** http://localhost:8080
- **Mailpit inbox (reset emails):** http://localhost:8025

Both ports bind to `127.0.0.1` only.

---

## Architecture

```
Browser (React SPA)
   │  same-origin HTTPS; HttpOnly session cookie + X-CSRF-Token header
   ▼
nginx  ── static assets, CSP + security headers, 64 KB body limit, /api reverse proxy
   │
   ▼
FastAPI ── middleware: request ID → security headers → body-size limit → CORS allowlist
   │       router dependency: CSRF verification on every unsafe method
   │       per-route: session resolution → role check → Pydantic validation → rate limit
   ▼
services/ (business logic: auth, sessions, audit, rate limiting, mail)
   ▼
SQLAlchemy 2 ── PostgreSQL: users, sessions, audit_events, password_reset_tokens, rate_limit_buckets
```

### Repository layout

```
backend/
  app/
    main.py                 app factory, routers, middleware
    cli.py                  create-admin, seed-demo, cleanup (retention)
    core/                   config (validated), database, security primitives, logging, errors
    api/dependencies.py     authentication, RBAC, CSRF, rate-limit helpers
    api/routes/             auth, account (profile/sessions/own events), dashboard, admin, lab, health
    services/               auth, sessions, audit, rate_limit, mail, password policy
    models/  schemas/       SQLAlchemy models; Pydantic request/response contracts
    middleware/             request context, body limit, security headers
  alembic/versions/         versioned migrations
  tests/                    67 pytest tests
frontend/
  src/lib/                  typed API client, auth context, validation, utilities
  src/components/           design system (ui/), layout, brand (logo, canvas visual)
  src/pages/                landing, auth, dashboard, settings, lab, admin/*
  src/test/                 21 Vitest + Testing Library tests
  nginx.conf  Dockerfile
docs/THREAT_MODEL.md  SECURITY.md  docker-compose.yml  .github/workflows/ci.yml
```

### Data model

| Table | Purpose | Notable constraints |
|---|---|---|
| `users` | identity, Argon2id hash, role, status, lockout counters | unique normalized email; indexes on role, status, created_at |
| `sessions` | opaque server sessions | unique `token_hash` (HMAC-SHA256); FK cascade; `(user_id, revoked_at)` index |
| `audit_events` | append-only security trail | indexes on type, severity, created_at, target; actor FK `SET NULL` |
| `password_reset_tokens` | single-use reset links | unique `token_hash`; `expires_at`, `used_at` |
| `rate_limit_buckets` | fixed-window counters shared by all workers | unique `(key, window_start)`; keys are hashed |

---

## Security design

The [OWASP Top 10 (2021)](https://owasp.org/Top10/) is the review framework. Each control below is **implemented** and, where marked ✅, **exercised by an automated test** that was run and passed.

| OWASP category | Control | Tested |
|---|---|---|
| A01 Broken Access Control | Deny-by-default routers (`require_user` / `require_admin`); role read from the DB on every request; ownership in every query (sessions, own events); 404 for other users' resources; admins cannot change their own role; denials audited | ✅ |
| A01 | Mass-assignment guard: request schemas use `extra="forbid"`; profile update only declares `name` | ✅ |
| A02 Cryptographic Failures | Argon2id (RFC 9106 defaults) with transparent rehash; tokens from `secrets` (256-bit); only HMAC-SHA256 digests of session and reset tokens are stored; no custom crypto | ✅ |
| A03 Injection | SQLAlchemy bound parameters everywhere; `LIKE` wildcards escaped; React escaping, no `dangerouslySetInnerHTML`; strict CSP | ✅ |
| A04 Insecure Design | Generic auth errors; identical registration and reset responses whether or not an account exists; constant-time dummy hash for unknown users | ✅ |
| A05 Security Misconfiguration | Startup validation refuses production with weak secret, SQLite, insecure cookies, wildcard CORS or dev mail; docs disabled in prod; security headers on API and SPA; non-root containers | ✅ |
| A06 Vulnerable Components | Locked dependencies (`uv.lock`, `package-lock.json`); `pip-audit` and `npm audit` in CI | run locally: no findings |
| A07 Identification & Auth Failures | HttpOnly + SameSite=Lax + Secure (`__Host-` prefix) cookies; 30 min idle / 12 h absolute expiry; rotation on login and password change; revocation on logout, suspension, role change and reset; lockout after 5 failures; DB-backed rate limits | ✅ |
| A08 Integrity Failures | CSRF: synchronizer token (HMAC of session) for authenticated requests, double-submit HttpOnly cookie before sign-in; custom header required | ✅ |
| A09 Logging & Monitoring | Append-only audit events with severity, outcome and request ID; metadata sanitized; JSON logs never include passwords, tokens, cookies or query strings | ✅ |
| A10 SSRF | No server-side fetching of user-supplied URLs; redirect targets restricted to same-origin paths | ✅ (open-redirect) |

### Sessions and CSRF in detail

1. `POST /auth/login` verifies the password and creates a session row, storing `HMAC(secret, token)`. The raw 256-bit token is sent only in the `HttpOnly` cookie.
2. The response includes `csrf_token = HMAC(secret, "csrf:" + token)`. The SPA keeps it **in memory only** and sends it as `X-CSRF-Token` on POST, PATCH and DELETE. Nothing is ever written to `localStorage`.
3. Each request resolves the session and enforces idle and absolute expiry, account status and revocation. `last_seen_at` is touched at most once a minute.
4. Before sign-in, `GET /auth/csrf` issues a random token in an HttpOnly `SameSite=Strict` cookie and returns it in the body (double-submit). This protects login, register and reset against login CSRF.

### Privacy and retention

- **IP addresses:** stored only as a network prefix (/24 for IPv4, /48 for IPv6).
- **User agents:** truncated to 200 characters. Full IPs are used transiently to build rate-limit keys, which are themselves SHA-256 hashed.
- **Retention:** `python -m app.cli cleanup` (schedule it daily) purges sessions 30 days after expiry or revocation, reset tokens one day after expiry, expired rate-limit windows, and audit events older than `SS_AUDIT_RETENTION_DAYS` (default 180).
- **Users' visibility:** they can see their own events but cannot modify or delete any. The API has no update or delete endpoint for audit events (verified by test).

---

## API reference

All endpoints live under `/api/v1` and return JSON. Errors use one envelope:
`{"error": {"code", "message", "fields"?, "request_id"?}}`. Interactive OpenAPI docs are at `/api/docs` in development.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health/live`, `GET /health/ready` | none | liveness; readiness (database check) |
| `GET /auth/csrf` | none | obtain CSRF token |
| `POST /auth/register` | none · 5/h/IP | create account (generic 202 response) |
| `POST /auth/login` | none · 20/5 min/IP, 10/15 min/email | sign in, sets cookie |
| `POST /auth/logout` | cookie | revoke current session |
| `GET /auth/me` | user | current user + CSRF token |
| `POST /auth/change-password` | user · 5/15 min | requires current password; rotates all sessions |
| `POST /auth/password-reset/request` | none · 5/h/IP, 3/h/email | generic 202 |
| `POST /auth/password-reset/confirm` | none · 10/h/IP | single-use token; revokes all sessions |
| `GET /profile`, `PATCH /profile` | user | read or update own name |
| `GET /sessions` | user | own active sessions |
| `DELETE /sessions/{id}`, `DELETE /sessions` | user | revoke one, or all others |
| `GET /audit-events` | user | own events (paginated) |
| `GET /dashboard/summary` | user | metrics (user- or admin-scoped) |
| `GET /admin/users`, `GET /admin/users/{id}` | admin | search, filter, paginate (max 100 per page) |
| `PATCH /admin/users/{id}` | admin | change role and/or status (audited, revokes sessions) |
| `POST /admin/users/{id}/unlock` | admin | clear lockout |
| `GET /admin/audit-events`, `GET /admin/audit-events/{id}` | admin | filter by type, severity, outcome, user, date |
| `POST /lab/sql-injection`, `/lab/xss`, `/lab/password-hashing`, `/lab/validation` | user · 60/min | educational demos |

---

## Configuration

Backend settings are environment variables with the `SS_` prefix (or `backend/.env`), validated at startup. See [backend/.env.example](backend/.env.example) and [.env.example](.env.example).

| Variable | Default | Notes |
|---|---|---|
| `SS_ENVIRONMENT` | `development` | `production` enables HSTS, Secure `__Host-` cookies, disables docs, enforces invariants |
| `SS_DATABASE_URL` | SQLite in `backend/var/` | must be `postgresql+psycopg://…` in production |
| `SS_SECRET_KEY` | dev placeholder | ≥ 32 random chars in production; rotating it invalidates all sessions and reset links |
| `SS_FRONTEND_URL` / `SS_CORS_ORIGINS` | `http://localhost:5173` | reset-link base / comma-separated allowlist |
| `SS_SESSION_IDLE_MINUTES` / `SS_SESSION_ABSOLUTE_HOURS` | 30 / 12 | session lifetime |
| `SS_LOGIN_MAX_FAILURES` / `SS_LOCKOUT_MINUTES` | 5 / 15 | account lockout |
| `SS_MAX_REQUEST_BYTES` | 65536 | request body limit |
| `SS_MAIL_BACKEND` | `outbox` | `smtp` required in production (`SS_SMTP_*`) |
| `SS_AUDIT_RETENTION_DAYS` | 180 | used by `cleanup` |
| `FORWARDED_ALLOW_IPS` (container) | `127.0.0.1` | IPs whose `X-Forwarded-*` headers uvicorn trusts |

Frontend: `VITE_API_BASE_URL` (default `/api/v1`).

---

## Testing and verification

```bash
cd backend
uv run pytest                     # 67 tests
uv run ruff check . && uv run ruff format --check .
uv run bandit -q -r app -c pyproject.toml
uv run pip-audit

cd ../frontend
npm test                          # 21 tests
npm run typecheck && npm run lint && npm run build
npm audit --omit=dev
```

**Backend suite:**
- **Auth:** registration, duplicate handling, hashing, login, lockout and suspension.
- **Sessions:** cookie flags, hashed storage, logout replay, idle and absolute expiry, rotation, revocation.
- **Passwords:** change, and reset (hashed, single-use, expiry, invalidation of older links).
- **Access control:** vertical and horizontal escalation, IDOR and mass assignment.
- **Web security:** CSRF (missing, forged and cross-flow tokens), SQL injection and LIKE wildcards, stored-markup handling, security headers, 413 limits, CORS.
- **Abuse and data:** rate limiting (including `Retry-After`), audit immutability and scoping, log redaction.
- **Workflow and migrations:** the full register → login → protected → logout flow, plus migrations from a clean database (upgrade → downgrade → upgrade → `alembic check` to detect model drift).

**Frontend suite:**
- **Forms:** client validation, the generic error message, server field-error mapping, password visibility toggle.
- **Security:** CSRF header and credentials on requests, open-redirect protection, auth and admin route guards, CSRF refresh-and-retry.

CI (`.github/workflows/ci.yml`) runs all of the above, re-runs the backend suite against **PostgreSQL 16**, applies migrations to a clean PostgreSQL schema, and builds both Docker images.

### Dynamic scanning (OWASP ZAP)

Run only against a local or explicitly authorized deployment:

```bash
docker compose up -d --build
docker run --rm --network host -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://localhost:8080 -r zap-report.html
```

---

## Deployment

### HTTPS and reverse proxy

Put a TLS terminator (Caddy, Traefik, a cloud load balancer, or nginx with certificates) in front of the `frontend` container:

1. Redirect HTTP to HTTPS. The API sends HSTS in production.
2. Forward `X-Forwarded-Proto: https`. The bundled nginx passes it through to the API.
3. Set `FORWARDED_ALLOW_IPS` on the backend to the proxy's address so clients cannot spoof their IP. Never expose the backend port publicly.
4. Set `SS_FRONTEND_URL` and `SS_CORS_ORIGINS` to the public `https://` origin.

### Production checklist

- [ ] Random `SS_SECRET_KEY` and database password, injected from a secret manager. Not committed, and not baked into images.
- [ ] PostgreSQL with TLS, encrypted at rest. The app user owns only the SecureSphere schema.
- [ ] Real SMTP provider (`SS_MAIL_BACKEND=smtp`) with SPF, DKIM and DMARC on the sending domain.
- [ ] `python -m app.cli cleanup` scheduled daily.
- [ ] Administrator created via `create-admin`. Run `seed-demo` only in development (it refuses in production).
- [ ] Log shipping to a central store with access controls. Alerts on `auth.lockout`, `authz.denied` bursts and `admin.user.update`.

### Backup and recovery

- **Backups:** nightly `pg_dump --format=custom` plus WAL archiving (or managed point-in-time recovery). Keep encrypted copies off-site, retained in line with the audit-retention policy.
- **Restore drills:** test restores into a scratch database regularly, then run `alembic upgrade head` and check `/api/v1/health/ready`.
- **If the database is stolen:** session and reset tokens are HMAC-hashed with `SS_SECRET_KEY` and passwords use Argon2id. Still, rotate the secret (this signs everyone out) and force password resets.

---

## Known limitations

These are honest gaps, not hidden ones. See the [threat model](docs/THREAT_MODEL.md) for residual risks.

- **No MFA.** TOTP or WebAuthn would be the next control to add.
- **No email verification at registration.** Email changes are not supported, partly for this reason.
- **Small common-password list.** Production should add a breached-password check, such as a k-anonymity range query.
- **Rate limits live in the application database.** They are shared across workers, but not tuned for very high traffic. Redis would be the scale-out path.
- **Audit log is append-only at the API level, not tamper-evident.** A database administrator could alter rows. Shipping events to write-once storage, or hash-chaining them, would close this.
- **Dashboard aggregates are computed per request.** Pre-aggregation would be needed at large scale.
- **SQLite is supported only for local development and tests.** Production refuses to start without PostgreSQL.
- **No independent penetration test.** OWASP ZAP and an external review are recommended before handling real user data.
- **Not executed in this environment:** the Docker images, Compose stack and CI workflow were written but not run, because Docker was not available. Every other check listed above was run.
