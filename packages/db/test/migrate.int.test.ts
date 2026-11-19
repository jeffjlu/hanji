import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  createTestDatabase,
  getConstraints,
  getIndexes,
  migrationsDone,
  snapshotCatalog,
} from '../src/testing/index.js';
import { migrateDatabase } from '../src/index.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

describe('migrate', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: typeof testDatabase.sql;

  beforeAll(async () => {
    testDatabase = await createTestDatabase({ migrate: false });
    sql = testDatabase.sql;
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('should run migrations successfully', async () => {
    const tables =
      await sql`SELECT COUNT(*) as count FROM pg_catalog.pg_tables WHERE schemaname = 'public'`;
    expect([...tables]).toEqual([{ count: '0' }]);

    await migrateDatabase(testDatabase.db);

    const tablesAfterMigration =
      await sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`;
    const tableNames = tablesAfterMigration.map((row) => row['tablename']);
    expect(tableNames).toContain('app_user');
    expect(tableNames).toContain('session');
  });

  it('should create all seven content and sync tables', async () => {
    await migrateDatabase(testDatabase.db);

    const tables =
      await sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`;
    const tableNames = tables.map((row) => row['tablename']);
    for (const table of [
      'unit',
      'entry',
      'kanji',
      'card',
      'content_version',
      'review_event',
      'user_card',
    ]) {
      expect(tableNames).toContain(table);
    }
  });

  it('should create the named constraints on every table', async () => {
    await migrateDatabase(testDatabase.db);

    const constraints = await sql<{ conname: string; constraint_type: string }[]>`
      SELECT
        con.conname,
        con.contype AS constraint_type
      FROM pg_catalog.pg_constraint con
      INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = con.connamespace
      WHERE nsp.nspname = 'public'
    `;
    expect([...constraints]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conname: 'app_user_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'app_user_email_unique', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'app_user_email_lowercase', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'session_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'session_token_hash_unique', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'unit_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'unit_slug_unique', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'unit_position_unique', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'entry_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'entry_gloss_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'entry_unit_id_unit_id_fk', constraint_type: 'f' }),
        expect.objectContaining({ conname: 'kanji_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'kanji_glyph_unique', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'kanji_gloss_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'card_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'card_unit_id_position_uq', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'card_kind_entry_uq', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'card_kind_kanji_uq', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'card_one_target_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'card_kind_target_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'card_entry_id_entry_id_fk', constraint_type: 'f' }),
        expect.objectContaining({ conname: 'card_kanji_id_kanji_id_fk', constraint_type: 'f' }),
        expect.objectContaining({ conname: 'card_unit_id_unit_id_fk', constraint_type: 'f' }),
        expect.objectContaining({ conname: 'content_version_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'review_event_pkey', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'review_event_user_seq_uq', constraint_type: 'u' }),
        expect.objectContaining({ conname: 'review_event_rating_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'review_event_retention_chk', constraint_type: 'c' }),
        expect.objectContaining({
          conname: 'review_event_response_ms_chk',
          constraint_type: 'c',
        }),
        expect.objectContaining({ conname: 'review_event_correct_chk', constraint_type: 'c' }),
        expect.objectContaining({
          conname: 'review_event_user_id_app_user_id_fk',
          constraint_type: 'f',
        }),
        expect.objectContaining({
          conname: 'review_event_card_id_card_id_fk',
          constraint_type: 'f',
        }),
        expect.objectContaining({ conname: 'user_card_user_id_card_id_pk', constraint_type: 'p' }),
        expect.objectContaining({ conname: 'user_card_stability_chk', constraint_type: 'c' }),
        expect.objectContaining({ conname: 'user_card_difficulty_chk', constraint_type: 'c' }),
        expect.objectContaining({
          conname: 'user_card_user_id_app_user_id_fk',
          constraint_type: 'f',
        }),
        expect.objectContaining({ conname: 'user_card_card_id_card_id_fk', constraint_type: 'f' }),
      ])
    );
  });

  it('should create the named indexes on every table', async () => {
    await migrateDatabase(testDatabase.db);

    const indexes = await sql<{ indexname: string; is_unique: boolean }[]>`
      SELECT
        idx.indexrelid::regclass::text AS indexname,
        idx.indisunique AS is_unique
      FROM pg_catalog.pg_index idx
      INNER JOIN pg_catalog.pg_class rel ON rel.oid = idx.indrelid
      INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
    `;
    expect([...indexes]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indexname: 'app_user_email_unique', is_unique: true }),
        expect.objectContaining({ indexname: 'session_token_hash_unique', is_unique: true }),
        expect.objectContaining({ indexname: 'session_user_id_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'unit_slug_unique', is_unique: true }),
        expect.objectContaining({ indexname: 'unit_position_unique', is_unique: true }),
        expect.objectContaining({ indexname: 'entry_unit_id_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'kanji_glyph_unique', is_unique: true }),
        expect.objectContaining({ indexname: 'card_entry_id_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'card_kanji_id_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'card_unit_id_position_uq', is_unique: true }),
        expect.objectContaining({ indexname: 'card_kind_entry_uq', is_unique: true }),
        expect.objectContaining({ indexname: 'card_kind_kanji_uq', is_unique: true }),
        expect.objectContaining({ indexname: 'review_event_user_seq_uq', is_unique: true }),
        expect.objectContaining({ indexname: 'review_event_user_card_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'review_event_user_day_idx', is_unique: false }),
        expect.objectContaining({ indexname: 'user_card_user_id_card_id_pk', is_unique: true }),
        expect.objectContaining({ indexname: 'user_card_user_seq_idx', is_unique: false }),
      ])
    );
  });

  it('should create the append-only trigger on review_event', async () => {
    await migrateDatabase(testDatabase.db);

    const triggers = await sql<{ tgname: string }[]>`
      SELECT tg.tgname
      FROM pg_catalog.pg_trigger tg
      INNER JOIN pg_catalog.pg_class rel ON rel.oid = tg.tgrelid
      INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'review_event'
        AND nsp.nspname = 'public'
        AND NOT tg.tgisinternal
    `;
    expect(triggers.map((row) => row.tgname)).toContain('review_event_no_update');
  });

  it('should create the correct constraints on the tables', async () => {
    const appUserConstraints = await getConstraints(sql, 'app_user');
    expect([...appUserConstraints]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_type: 'p',
          constraint_definition: 'PRIMARY KEY (id)',
        }),
        expect.objectContaining({
          constraint_type: 'u',
          constraint_definition: 'UNIQUE (email)',
        }),
        expect.objectContaining({
          constraint_type: 'c',
          constraint_definition: 'CHECK ((email = lower(email)))',
        }),
      ])
    );

    const sessionConstraints = await getConstraints(sql, 'session');
    expect([...sessionConstraints]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_type: 'p',
          constraint_definition: 'PRIMARY KEY (id)',
        }),
        expect.objectContaining({
          constraint_type: 'u',
          constraint_definition: 'UNIQUE (token_hash)',
        }),
        expect.objectContaining({
          constraint_type: 'f',
          constraint_definition: 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE',
        }),
      ])
    );
  });

  it('should create the correct indexes on the tables', async () => {
    const appUserIndexes = await getIndexes(sql, 'app_user');
    expect([...appUserIndexes]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index_name: 'app_user_email_unique',
          is_unique: true,
        }),
      ])
    );

    const sessionIndexes = await getIndexes(sql, 'session');
    expect([...sessionIndexes]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index_name: 'session_token_hash_unique',
          is_unique: true,
        }),
        expect.objectContaining({
          index_name: 'session_user_id_idx',
          is_unique: false,
        }),
      ])
    );
  });
});

describe('migrate twice', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let sql: typeof testDatabase.sql;

  beforeAll(async () => {
    testDatabase = await createTestDatabase({ migrate: false });
    sql = testDatabase.sql;
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('should be idempotent', async () => {
    await migrateDatabase(testDatabase.db);
    const snapshotBefore = await snapshotCatalog(sql);
    expect(snapshotBefore.columns.length).toBeGreaterThan(0);
    const migrationsDoneBefore = await migrationsDone(sql);
    expect(migrationsDoneBefore).toBeGreaterThan(0);

    await migrateDatabase(testDatabase.db);
    const snapshotAfter = await snapshotCatalog(sql);
    const migrationsDoneAfter = await migrationsDone(sql);

    expect(snapshotBefore).toEqual(snapshotAfter);
    expect(migrationsDoneBefore).toEqual(migrationsDoneAfter);
  });
});

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const drizzleDir = join(repoRoot, 'packages', 'db', 'drizzle');

function snapshotDir(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    result[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return result;
}

describe('db:generate', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    testDatabase = await createTestDatabase({ migrate: false });
  });

  afterAll(async () => {
    await testDatabase.dispose();
  });

  it('produces no new migration (no schema drift)', () => {
    const before = snapshotDir(drizzleDir);
    expect(Object.keys(before).length).toBeGreaterThan(0);

    execFileSync('pnpm', ['--filter', '@hanji/db', 'run', 'db:generate'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: testDatabase.databaseURL },
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(snapshotDir(drizzleDir)).toEqual(before);
  });
});
