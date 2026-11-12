# 0002 — Auth and single-origin deployment

## Status
Accepted

## Context
Hanji needs user authentication (registration, login, logout, current-user) and must protect state-changing requests from cross-site request forgery. The app is deployed from a single origin: the Fastify API serves both the JSON API and the built web frontend. In development, Vite proxies `/api` to the API on `localhost:3000`.

## Decision
- **Session design:** server-side sessions with 256-bit random session tokens; only a hash of the token is stored in the `session` table. The session cookie is `httpOnly`, `SameSite=Lax`, path `/`, and `Secure` when `NODE_ENV` is production. Session lifetime is 30 days, extended when fewer than 15 days remain.
- **Invite-only registration:** `POST /auth/register` requires a `REGISTRATION_CODE` from the environment. Wrong code returns 403. This limits abuse without email infrastructure.
- **Origin check:** every POST, PATCH, DELETE request must carry an `Origin` header matching `WEB_ORIGIN` (falling back to `Referer` only if `Origin` is absent); otherwise it returns 403. No CSRF tokens are used.
- **Rate limiting:** register and login are rate-limited per IP (default 10 requests per minute, configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS`). Exceeding the limit returns 429 with a `Retry-After` header.
- **Single-origin deployment:** the API serves the built web app with an SPA fallback. No CORS is configured, and there is no separate static host.
- **No password reset:** there is no password-reset flow in Phase 0. Users who forget their password must create a new account with the invite code.

## Rationale
- **Server-side sessions** avoid storing sensitive data in localStorage and work naturally with `httpOnly` cookies. Hashing the session token means a database leak does not expose valid session cookies.
- **Invite-only registration** is a simple, effective abuse deterrent that does not require an email provider, SMTP setup, or verification flow — all out of scope for Phase 0.
- **Origin check instead of CSRF tokens:** with `SameSite=Lax` cookies, a JSON-only API, and a single origin, the `Origin` header check is an accepted CSRF defence under OWASP guidance. Adding a CSRF token would add complexity (token issuance, rotation, frontend handling) without a clear benefit at this threat level. The reasoning is recorded here so it can be revisited if the threat model changes.
- **Rate limits on auth endpoints** protect against brute-force password guessing and registration spam. Limits are on by default but can be relaxed in test environments.
- **Single-origin deployment** eliminates CORS entirely and avoids cross-site cookie problems that would arise with a separate static host and API host under `SameSite=Lax`.

## Consequences
- `WEB_ORIGIN` must be set correctly in every environment; state-changing requests from any other origin are rejected with 403.
- `REGISTRATION_CODE` must be set in `.env` and shared out-of-band with intended users.
- There is no password reset, no email verification, and no email-sending infrastructure. Account recovery is not supported in Phase 0.
- If the project ever splits into separate static and API origins, the session and CSRF design must be revisited (this was the motivation for the single-origin decision — see the "Left out" section of `plan.md`).
