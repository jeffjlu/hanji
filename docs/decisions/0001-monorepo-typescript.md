# 0001 — TypeScript monorepo

## Status
Accepted

## Context
Hanji is a full-stack TypeScript application with a Fastify API (`apps/api`), a Vite/React web frontend (`apps/web`), and shared libraries (`packages/core`, `packages/schemas`, `packages/db`) plus a content pipeline (`tools/content-pipeline`). The project could have been structured as separate repositories or as a single package, but a monorepo was chosen.

## Decision
Use a pnpm workspace TypeScript monorepo with `apps/*`, `packages/*`, and `tools/*`, all scoped under `@hanji/*` and extending a single root `tsconfig.json`.

## Rationale
- **Shared types without a build step.** Packages import each other directly via workspace aliases (e.g. `@hanji/schemas`), so changing a Zod schema is reflected by `pnpm typecheck` in both `apps/api` and `apps/web` immediately — no manual build or publish cycle.
- **Shared domain logic.** `packages/core` holds FSRS replay, XP/level/streak computation, and answer normalisation. The same code runs on the server (authoritative check inside `/sync`) and on the client (offline-first computation), guaranteeing identical results.
- **Phase 1 alignment.** Phase 1 will add the `ts-fsrs` scheduling library as a shared dependency in `packages/core`. A monorepo makes `ts-fsrs` available to both the API (server-side replay) and the web app (client-side scheduling) with a single version and identical imports.
- **Single configuration.** One root `tsconfig.json`, one ESLint config, one Prettier config, one `.editorconfig` — all packages inherit them, keeping tooling consistent.
- **Atomic changes.** A schema change plus the API and web updates that depend on it land in one pull request, keeping CI green across the whole repo.

## Consequences
- `pnpm install` at the root installs all workspace dependencies; `pnpm -r run <script>` runs a script across every package.
- New packages must extend the root `tsconfig.json` and export from their entry point so workspace imports resolve.
- All package names follow the `@hanji/*` scope; renaming the scope later is a find-and-replace across `package.json` files and imports.
