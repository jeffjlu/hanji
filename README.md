# Hanji

## Local database

Hanji uses [PostgreSQL](https://www.postgresql.org/) 18 via Docker Compose.

### Start / stop / reset

```bash
# Start PostgreSQL in the background
pnpm db:up

# Stop PostgreSQL (keeps the data volume)
pnpm db:down

# Stop and remove the data volume, then start a fresh empty database
pnpm db:reset
```

`pnpm db:reset` runs `docker compose down -v && docker compose up -d`, so it leaves a brand-new empty database.

### Environment variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

The application reads these variables (via [`packages/db`](#packages-db)):

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgres://hanji:hanji_local_dev@localhost:5432/hanji` | Local Postgres connection URL. Format: `postgres://USER:PASSWORD@HOST:PORT/DATABASE`. Must match the `POSTGRES_*` values in `.env.example`. URL-encode special characters in the password. |
| `NODE_ENV` | `development` | One of `development`, `test`, `production`. |
| `SESSION_SECRET` | `change-me-local-dev-secret-at-least-32-chars` | At least 32 characters. Generate one with `openssl rand -base64 48`. |
| `WEB_ORIGIN` | `http://localhost:5173` | An origin with no path and no trailing slash. |
| `REGISTRATION_CODE` | `local-invite-code` | At least 8 characters. |

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
pnpm install       # install dependencies
pnpm typecheck     # type-check every workspace project
pnpm test          # run the unit test suite
pnpm lint          # lint the repository
pnpm build         # build all packages
```
