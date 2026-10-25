# SecureSphere threat model

Method: data-flow diagram + STRIDE per element, reviewed against the OWASP Top 10.
Scope: the application as deployed by `docker-compose.yml` behind a TLS-terminating proxy.

## 1. Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| User credentials | Account takeover; reuse on other sites | Argon2id hashes in `users.password_hash` |
| Session tokens | Equivalent to being signed in | Browser HttpOnly cookie; only HMAC digest in `sessions` |
| Password-reset tokens | One-click account takeover | Email; only HMAC digest in `password_reset_tokens` |
| Administrator privilege | Full control of users and audit visibility | `users.role` |
| Audit trail | Detection, investigation, accountability | `audit_events` |
| `SS_SECRET_KEY` | Forges CSRF tokens; links DB digests to tokens | Environment / secret manager |
| Personal data | Names, emails, network prefixes, user agents | `users`, `sessions`, `audit_events` |

## 2. Actors

- **Anonymous attacker on the internet:** credential stuffing, CSRF, injection, enumeration.
- **Authenticated malicious user:** privilege escalation, IDOR, mass assignment, abuse of the lab.
- **Compromised administrator account:** the highest-impact insider.
- **Attacker with a database dump:** backup leak or SQL access.
- **Network attacker:** mitigated by TLS outside the app.

## 3. Trust boundaries

```
[Browser] ──TB1── [TLS proxy / nginx] ──TB2── [FastAPI] ──TB3── [PostgreSQL]
                                                  └──TB4── [SMTP provider]
```

- **TB1 Internet → edge:** all input is untrusted. TLS, body limits and headers apply here.
- **TB2 Edge → API:** forwarded headers are trusted only from `FORWARDED_ALLOW_IPS`. The API is not published.
- **TB3 API → database:** parameterized SQL only. Credentials come from the environment.
- **TB4 API → mail:** reset links leave the system. Tokens are in the URL fragment, not the query string.

## 4. Threats and mitigations (STRIDE)

| # | Threat | STRIDE | Mitigation | Verified by |
|---|---|---|---|---|
| T1 | Credential stuffing / brute force | S | Per-IP and per-email rate limits (DB-backed); lockout after 5 failures; generic errors; audit + `rate_limit.exceeded` events | `test_login_rate_limited_per_email`, `test_account_lockout_after_repeated_failures` |
| T2 | Account enumeration via responses or timing | I | Identical messages and status codes for register, login and reset; dummy Argon2 verification for unknown emails | `test_duplicate_email_gets_identical_response`, `test_wrong_password_and_unknown_user_are_indistinguishable`, `test_request_is_generic_for_unknown_accounts` |
| T3 | Session theft via XSS | S/I | HttpOnly cookies; no tokens in JS storage; React escaping; CSP `script-src 'self'` | `test_login_sets_hardened_cookie`, XSS lab |
| T4 | Session fixation / replay after logout | S | New random token on every login; previous cookie session revoked; server-side revocation | `test_login_rotates_existing_session`, `test_logout_invalidates_session_server_side` |
| T5 | Long-lived stolen session | S | 30 min idle / 12 h absolute expiry; revoke on password change, reset, suspension, role change; user-visible session list | `test_idle_timeout`, `test_absolute_timeout`, `test_change_rotates_and_revokes_sessions` |
| T6 | CSRF on state-changing requests | T | Session-bound HMAC token in a custom header; double-submit before sign-in; SameSite cookies; CORS allowlist | `TestCsrf` (5 tests) |
| T7 | Vertical privilege escalation | E | `require_admin` reads the role from the DB; schemas forbid `role` on profile; admins cannot alter themselves | `test_user_cannot_reach_admin`, `test_user_cannot_self_promote_*` |
| T8 | Horizontal escalation / IDOR | E/I | Ownership included in queries; 404 for foreign IDs | `test_cannot_revoke_another_users_session_idor`, `test_user_audit_feed_only_contains_own_events` |
| T9 | SQL injection | T/I | ORM bound parameters; escaped LIKE patterns; no string-built SQL (Bandit in CI) | `TestInjection`, SQL lab test |
| T10 | Reset-token theft or reuse | S | 256-bit tokens, hashed at rest, single use, 30 min expiry, older tokens invalidated, URL fragment | `TestPasswordReset` (5 tests) |
| T11 | Database dump | I | Argon2id hashes; token digests keyed with `SS_SECRET_KEY` (not in DB); IP prefixes only | design review |
| T12 | Audit tampering by users | R | No update or delete endpoints; users only read their own events | `test_audit_events_cannot_be_modified` |
| T13 | Secrets or PII in logs | I | Structured logs with key-based redaction; paths without query strings; validation errors never echo input | `test_validation_errors_do_not_echo_input`, `test_redaction_hides_secrets_but_keeps_counts` |
| T14 | Resource exhaustion (large bodies, unbounded queries) | D | 64 KB body limit (nginx + ASGI); `page_size` ≤ 100; bounded dashboard windows; timeouts | `test_oversized_body_rejected` |
| T15 | Clickjacking / MIME sniffing | T | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` | `test_security_headers_present` |
| T16 | Open redirect after login | S | `next` limited to same-origin absolute paths | `safeRedirect` unit tests |
| T17 | Insecure production configuration | — | Startup validation refuses weak secret, SQLite, insecure cookies, wildcard CORS, dev mail | config validator |
| T18 | Lab used as an attack vector | T/E | Vulnerable code is never executed; SQL demo uses a throwaway in-memory DB of fictional rows; auth + 60/min limit; strict schemas | `TestLab` |
| T19 | Vulnerable dependencies | — | Lockfiles; `pip-audit` and `npm audit` in CI | CI |

## 5. Residual risks

| Risk | Rating | Notes / next step |
|---|---|---|
| Phished password without MFA | High | Add TOTP or WebAuthn; MFA required for admins |
| Malicious or compromised administrator | Medium | Audit trail records actions, but no four-eyes approval; ship logs to write-once storage |
| Audit log not tamper-evident against DB admins | Medium | Hash-chain events or stream to an append-only sink |
| Distributed credential stuffing below per-IP limits | Medium | Per-email limits and lockout help; add breached-password checks and bot detection |
| Lockout abused to block a known user | Low/Medium | Time-boxed (15 min); admins can unlock; consider progressive delays instead |
| `style-src 'unsafe-inline'` in CSP | Low | Required by UI libraries' inline style attributes; scripts remain `'self'` only |
| SMTP compromise exposes reset links | Low | Short expiry, single use, all sessions revoked on reset |
| Secret-key compromise | High impact, low likelihood | Store in a secret manager; rotation invalidates all sessions |
