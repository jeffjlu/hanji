import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  getConstraints,
  getIndexes,
  migrationsDone,
  snapshotCatalog,
} from '../src/testing/index.js';
import { migrateDatabase } from '../src/index.js';

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
