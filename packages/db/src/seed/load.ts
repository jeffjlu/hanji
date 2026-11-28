import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { type PgTable, type PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { type Database } from '../client.js';
import { getCurrentContentVersion } from '../queries/content-version.js';
import { type Transaction } from '../queries/executor.js';
import { card, contentVersion, entry, kanji, unit } from '../schema/content.js';
import { contentVersionHash, seedToRows, type SeedRows } from './rows.js';
import { parseSeed, type Seed, SeedError } from './schema.js';

/** The hand-written Phase 1 seed. `pnpm db:seed <file>` or SEED_FILE overrides it. */
export const DEFAULT_SEED_FILE = fileURLToPath(new URL('../../seed/seed.json', import.meta.url));

/** Serialises concurrent loaders (two deploys, a test and a dev shell). Arbitrary constant. */
const SEED_LOCK_KEY = 4_826_170_310;

type ContentTable = keyof SeedRows;
const TABLES: ContentTable[] = ['units', 'entries', 'kanji', 'cards'];

export type LoadSeedResult = {
  versionHash: string;
  /** True when a new content version was recorded. */
  versionChanged: boolean;
  /** Rows in the seed, per table. */
  counts: Record<ContentTable, number>;
  /** Rows inserted or updated, per table. Zero everywhere on an unchanged reseed. */
  written: Record<ContentTable, number>;
  /** Ids in the database that the seed no longer contains. Never deleted. */
  orphans: Record<ContentTable, string[]>;
};

/** The seed conflicts with rows already in the database. Nothing was written. */
export class SeedConflictError extends SeedError {
  override name = 'SeedConflictError';
}

/** Reads and validates a seed file without touching the database. */
export function readSeedFile(path: string): Seed {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new SeedError(`Cannot read seed file ${path}: ${(err as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new SeedError(`Seed file ${path} is not valid JSON: ${(err as Error).message}`);
  }
  return parseSeed(json, `seed file ${path}`);
}

/**
 * Upserts every row of a validated seed in one transaction. Idempotent: an
 * unchanged seed writes nothing and records no new content version.
 *
 * - Ids are derived from natural keys, so they never change across reseeds.
 * - Nothing is deleted. Rows missing from the seed are left in place and
 *   reported in `orphans`, because review events may reference them.
 * - A content version is recorded only when the seed's hash differs from the
 *   current one (so A, then B, then A again records A as current).
 */
export async function loadSeed(db: Database, seed: Seed): Promise<LoadSeedResult> {
  const rows = seedToRows(seed);
  const versionHash = contentVersionHash(seed);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`);

    const orphans = await findOrphans(tx, rows);
    await assertOrphansKeepClear(tx, rows, orphans);
    await parkMovedPositions(tx, rows);

    const written: LoadSeedResult['written'] = {
      units: await upsert(tx, unit, rows.units),
      entries: await upsert(tx, entry, rows.entries),
      kanji: await upsert(tx, kanji, rows.kanji),
      cards: await upsert(tx, card, rows.cards),
    };

    const versionChanged = (await getCurrentContentVersion(tx)) !== versionHash;
    if (versionChanged) {
      await tx
        .insert(contentVersion)
        .values({ versionHash })
        .onConflictDoUpdate({ target: contentVersion.versionHash, set: { loadedAt: sql`now()` } });
    }

    const counts = Object.fromEntries(TABLES.map((t) => [t, rows[t].length])) as Record<
      ContentTable,
      number
    >;
    return { versionHash, versionChanged, counts, written, orphans };
  });
}

async function findOrphans(tx: Transaction, rows: SeedRows): Promise<LoadSeedResult['orphans']> {
  const orphanIds = async (
    table: typeof unit | typeof entry | typeof kanji | typeof card,
    seedIds: string[]
  ) => {
    const found = await tx
      .select({ id: table.id })
      .from(table)
      .where(notInArray(table.id, seedIds))
      .orderBy(table.id);
    return found.map((r) => r.id);
  };
  const ids = (key: ContentTable) => rows[key].map((r) => r.id);
  return {
    units: await orphanIds(unit, ids('units')),
    entries: await orphanIds(entry, ids('entries')),
    kanji: await orphanIds(kanji, ids('kanji')),
    cards: await orphanIds(card, ids('cards')),
  };
}

/**
 * An orphan still holds its unit position (or, for a unit, its global
 * position). If the seed wants that slot, stop with a clear message rather
 * than a raw unique-constraint error: a person must decide what moves.
 */
async function assertOrphansKeepClear(
  tx: Transaction,
  rows: SeedRows,
  orphans: LoadSeedResult['orphans']
): Promise<void> {
  const problems: string[] = [];

  if (orphans.cards.length > 0) {
    const wanted = new Map(rows.cards.map((c) => [`${c.unitId}#${c.position}`, c.id]));
    const held = await tx
      .select({ id: card.id, unitId: card.unitId, position: card.position })
      .from(card)
      .where(inArray(card.id, orphans.cards));
    for (const o of held) {
      const seedCard = wanted.get(`${o.unitId}#${o.position}`);
      if (seedCard) {
        problems.push(
          `card ${seedCard} wants position ${o.position} in unit ${o.unitId}, held by card ${o.id}, which is not in the seed`
        );
      }
    }
  }

  if (orphans.units.length > 0) {
    const wanted = new Map(rows.units.map((u) => [u.position, u.slug]));
    const held = await tx
      .select({ id: unit.id, slug: unit.slug, position: unit.position })
      .from(unit)
      .where(inArray(unit.id, orphans.units));
    for (const o of held) {
      const seedUnit = wanted.get(o.position);
      if (seedUnit) {
        problems.push(
          `unit "${seedUnit}" wants position ${o.position}, held by unit "${o.slug}", which is not in the seed`
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new SeedConflictError(
      [
        'The seed conflicts with content already in the database. Nothing was written.',
        ...problems.map((p) => `  - ${p}`),
        'Give the seed row another position, or put the old row back in the seed.',
      ].join('\n')
    );
  }
}

/**
 * Positions are unique (per unit for cards, globally for units) and checked
 * row by row, so swapping two cards' positions in one upsert would fail.
 * Rows whose slot changes first move to a temporary negative position, which
 * cannot clash: seed positions are non-negative and existing ones are unique.
 */
async function parkMovedPositions(tx: Transaction, rows: SeedRows): Promise<void> {
  const seedCards = new Map(rows.cards.map((c) => [c.id, c]));
  const existingCards = await tx
    .select({ id: card.id, unitId: card.unitId, position: card.position })
    .from(card)
    .where(inArray(card.id, [...seedCards.keys()]));
  const movedCards = existingCards
    .filter((c) => {
      const s = seedCards.get(c.id)!;
      return s.unitId !== c.unitId || s.position !== c.position;
    })
    .map((c) => c.id);
  if (movedCards.length > 0) {
    await tx
      .update(card)
      .set({ position: sql`-${card.position} - 1` })
      .where(inArray(card.id, movedCards));
  }

  const seedUnits = new Map(rows.units.map((u) => [u.id, u]));
  const existingUnits = await tx
    .select({ id: unit.id, position: unit.position })
    .from(unit)
    .where(inArray(unit.id, [...seedUnits.keys()]));
  const movedUnits = existingUnits
    .filter((u) => seedUnits.get(u.id)!.position !== u.position)
    .map((u) => u.id);
  if (movedUnits.length > 0) {
    await tx
      .update(unit)
      .set({ position: sql`-${unit.position} - 1` })
      .where(inArray(unit.id, movedUnits));
  }
}

/**
 * `ON CONFLICT (id) DO UPDATE` that only touches rows whose values differ, so
 * an unchanged reseed rewrites nothing. Returns how many rows were written.
 */
async function upsert<T extends typeof unit | typeof entry | typeof kanji | typeof card>(
  tx: Transaction,
  table: T,
  values: T['$inferInsert'][]
): Promise<number> {
  if (values.length === 0) return 0;
  const written = await tx
    .insert(table)
    .values(values as never)
    .onConflictDoUpdate({ target: table.id, ...updateChanged(table) })
    .returning({ id: table.id });
  return written.length;
}

function updateChanged<T extends PgTable>(table: T): { set: PgUpdateSetSource<T>; setWhere: SQL } {
  // Column names come from our own schema, never from input, so raw SQL is safe.
  const name = getTableName(table);
  const columns = Object.entries(getTableColumns(table)).filter(([key]) => key !== 'id');
  const set = Object.fromEntries(
    columns.map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)])
  ) as PgUpdateSetSource<T>;
  const current = columns.map(([, c]) => `"${name}"."${c.name}"`).join(', ');
  const incoming = columns.map(([, c]) => `excluded."${c.name}"`).join(', ');
  return { set, setWhere: sql.raw(`(${current}) IS DISTINCT FROM (${incoming})`) };
}
