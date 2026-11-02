import { inject } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createDb, migrateDatabase, type Sql } from '@hanji/db';

declare module 'vitest' {
  interface ProvidedContext {
    adminDatabaseUrl: string;
  }
}

const TEST_DB_PREFIX = 'test_';
const TEST_DB_NAME_PATTERN = /^test_[0-9a-f]{8}$/;

/**
 * Creates a per-file test database: `CREATE DATABASE test_<random>` on the admin
 * connection, runs migrations against it, and returns a `createDb` handle plus a
 * `dispose()` that closes the pool and drops the database (WITH (FORCE)).
 */
export async function createTestDatabase() {
  const adminDatabaseUrl = inject('adminDatabaseUrl');

  const admin = createDb(adminDatabaseUrl, { max: 1 });
  const databaseName = `${TEST_DB_PREFIX}${randomBytes(4).toString('hex')}`;

  if (!TEST_DB_NAME_PATTERN.test(databaseName)) {
    throw new Error(`Invalid test database name: ${databaseName}`);
  }

  // `CREATE DATABASE` cannot run inside a transaction and does not accept
  // parameterized identifiers, so the (self-generated, validated) name is inlined.
  try {
    await admin.sql.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.close();
  }

  const databaseUrl = new URL(adminDatabaseUrl);
  databaseUrl.pathname = `/${databaseName}`;

  const { db, sql, close } = createDb(databaseUrl.href);
  const dispose = async (): Promise<void> => {
    try {
      await close();
    } finally {
      const dropAdmin = createDb(adminDatabaseUrl, { max: 1 });
      try {
        // Terminate existing connections so the drop can proceed.
        await dropAdmin.sql.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      } finally {
        await dropAdmin.close();
      }
    }
  };

  try {
    await migrateDatabase(db);
  } catch (err) {
    await dispose();
    throw err;
  }

  return { db, sql, databaseURL: databaseUrl.href, dispose };
}

export function resetTables(sql: Sql): Promise<void> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ name: string }[]>`select current_database() as name`;
    const databaseName = rows[0]?.name;
    if (!databaseName || !TEST_DB_NAME_PATTERN.test(databaseName)) {
      throw new Error(`Refusing to reset a non-test database: ${databaseName}`);
    }

    const tables = await tx.unsafe<{ table_name: string }[]>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    );

    for (const { table_name } of tables) {
      await tx.unsafe(`TRUNCATE TABLE "public"."${table_name}" RESTART IDENTITY CASCADE`);
    }
  });
}
