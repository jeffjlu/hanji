# Hanji

[![CI](https://github.com/jeffjlu/hanji/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffjlu/hanji/actions/workflows/ci.yml)

Hanji is an evidence-based Chinese and Japanese learning app for English-speaking adults preparing for a trip. It combines spaced retrieval practice (FSRS), frequency-ordered vocabulary, graded reading and listening input, and tone/pitch-accent ear training, with a game layer (XP, levels, a skill map) computed from measured memory strength. It's a work in progress — Phase 0 (foundations: monorepo, CI, local database, auth, health check, web shell) is in progress and none of the plan's features are deployed yet.

## Status

Phase 0 in progress. Not deployed.

## Architecture

Hanji is a TypeScript monorepo (`apps/*`, `packages/*`) served from one origin. In production the Fastify API serves the built web app, so there's no CORS and no cross-site cookie problem. In development Vite runs the web app on `localhost:5173` and proxies `/api` to the API on `localhost:3000`, which is why `WEB_ORIGIN` is `http://localhost:5173` locally.

## Quickstart

### Prerequisites

- Node.js 24 LTS (root `package.json` `engines: node >= 24.0.0`)
- pnpm 12 (root `package.json` `devEngines: pnpm >=12.0.0 <13.0.0`)
- Docker (for the local PostgreSQL database)

### Steps

```bash
git clone <repo> && cd hanji
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

### What to expect

Open `http://localhost:5173` in your browser. The web app runs there and proxies API calls to `http://localhost:3000`. Register with the invite code from `.env` (`REGISTRATION_CODE`, default `local-invite-code`). The API health endpoint is at `http://localhost:3000/api/v1/health`.

## Auth notes

Registration is invite-only: you need the `REGISTRATION_CODE` from `.env` to create an account. There is no password reset and no email verification — both are out of scope for Phase 0.

## Testing

```bash
pnpm test          # unit tests (vitest)
```

Unit tests run without Docker. Integration tests (`**/*.int.test.ts`) spin up a throwaway PostgreSQL database per run using Testcontainers (`postgres:18-alpine`), so they need Docker. `pnpm test` runs unit and integration tests together.

End-to-end tests use Playwright:

```bash
pnpm e2e           # Playwright end-to-end tests
```

## Local database

Hanji uses [PostgreSQL](https://www.postgresql.org/) 18 via Docker Compose.

### Start / stop / reset

Database container commands are listed in [Commands](#commands): `pnpm db:up`, `pnpm db:down`, and `pnpm db:reset`. `pnpm db:reset` runs `docker compose down -v && docker compose up -d`, so it leaves a brand-new empty database.

### Environment variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

The application reads these variables (via [`packages/db`](#database-tooling)):

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgres://hanji:hanji_local_dev@localhost:5432/hanji` | Local Postgres connection URL. Format: `postgres://USER:PASSWORD@HOST:PORT/DATABASE`. Must match the `POSTGRES_*` values in `.env.example`. URL-encode special characters in the password. |
| `NODE_ENV` | `development` | One of `development`, `test`, `production`. |
| `SESSION_SECRET` | `change-me-local-dev-secret-at-least-32-chars` | At least 32 characters. Generate one with `openssl rand -base64 48`. |
| `WEB_ORIGIN` | `http://localhost:5173` | An origin with no path and no trailing slash. |
| `REGISTRATION_CODE` | `local-invite-code` | At least 8 characters. |
| `RATE_LIMIT_MAX` | `10` | Max requests allowed per rate-limit window for rate-limited routes. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Length of the rate-limit window in seconds. |

Missing or malformed values stop startup with a message naming the offending variable. Secret values are never logged.

### docker-compose

`docker-compose.yml` runs `postgres:18-alpine`, mounts a named volume (`postgres_data`), and includes a `pg_isready` healthcheck. The `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT` values are read from `.env` with safe local defaults.

## Workspace

- `packages/schemas` — shared Zod schemas (health, register, login, current-user)
- `packages/core` — shared domain logic
- `packages/db` — Drizzle ORM client factory, config loading, migrations
- `apps/api` — Fastify API
- `apps/web` — React frontend

### Database tooling

`packages/db` exports a Drizzle client factory (`createDb`) and a Zod-validated config module (`loadConfig`, `loadDbConfig`). Migration generation and execution use the same config:

```bash
# Generate a migration from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate
```

## Commands

```bash
# Install dependencies
pnpm install

# Type-check every workspace project
pnpm typecheck

# Run the unit test suite
pnpm test

# Lint the repository
pnpm lint

# Build all packages
pnpm build

# Start both API and web dev servers
pnpm dev

# Run Playwright end-to-end tests
pnpm e2e

# Database
# Start local PostgreSQL
pnpm db:up

# Stop local PostgreSQL (keeps the data volume)
pnpm db:down

# Stop and remove the data volume, then start a fresh empty database
pnpm db:reset

# Generate a migration from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Seed database (placeholder in Phase 0)
pnpm db:seed
```
