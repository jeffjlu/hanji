# 0003 — PostgreSQL 18 for the local database

## Status
Accepted

## Context
The project plan targets PostgreSQL 16 or later, and the local database runs via Docker Compose (`docker-compose.yml`). The initial Docker setup selected `postgres:18-alpine` (commit `30aa19e`, "feat(db): add local Postgres Docker setup"), while `AGENTS.md` and the plan state the baseline as "PostgreSQL 16+".

## Decision
Use PostgreSQL 18 (`postgres:18-alpine`) for the local development database, rather than the plan's minimum of 16. This was a deliberate bump to a newer supported major release.

## Rationale
- PostgreSQL 18 satisfies the plan's "16 or later" requirement.
- Keeping the local database on the same major version as production avoids version-migration surprises.
- The `postgres:18-alpine` image is small and widely available.

## Consequences
- `docker-compose.yml` must keep `image: postgres:18-alpine`; README documents PostgreSQL 18. If the image is ever changed, update `docker-compose.yml`, `README.md`, and this record together.
- Drizzle ORM / `pg` client compatibility must be re-checked on any future major Postgres upgrade.
