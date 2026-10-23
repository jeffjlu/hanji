# Agent Instructions for Hanji

## Commands

### Install dependencies
```bash
pnpm install
```

### Run all tests
```bash
pnpm test
```

### Run linting
```bash
pnpm lint
```

### Run type checking
```bash
pnpm typecheck
```

### Build all packages
```bash
pnpm build
```

### Database commands
```bash
# Start local PostgreSQL
pnpm db:up

# Stop local PostgreSQL
pnpm db:down

# Reset database (drops all data)
pnpm db:reset

# Generate migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Seed database (placeholder in Phase 0)
pnpm db:seed
```

### Development
```bash
# Start both API and web dev servers
pnpm dev
```

### End-to-end tests
```bash
pnpm e2e
```

## Conventions

- **Monorepo**: pnpm workspaces with `apps/*`, `packages/*`, `tools/*`
- **Language**: TypeScript 6.x, Node.js 24 LTS
- **Package scope**: `@hanji/*` (e.g., `@hanji/core`, `@hanji/schemas`, `@hanji/db`, `@hanji/api`, `@hanji/web`)
- **Shared config**: Root `tsconfig.json` extended by all packages
- **Linting**: ESLint 9 with TypeScript ESLint, Prettier for formatting
- **Testing**: Vitest for unit/integration, Playwright for e2e
- **Database**: PostgreSQL 16+, Drizzle ORM, migrations in `packages/db/migrations`
- **API**: Fastify with Zod validation (no generated OpenAPI; one origin serves app + API)
- **Web**: Vite, React 19, React Router, Tailwind CSS v4, shadcn/ui
- **Auth**: Email/password, Argon2id, server-side sessions, httpOnly SameSite=Lax cookies, Origin check on state-changing requests (no CSRF tokens)
- **Offline-first**: Dexie (IndexedDB) for local storage, Workbox for PWA

## Git

- Commit messages follow Conventional Commits
- Branch protection requires CI to pass before merge