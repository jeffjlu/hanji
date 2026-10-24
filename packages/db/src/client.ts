import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type CreateDbOptions = {
  /** Maximum pool size. Default 10. */
  max?: number;
  /** Seconds to wait when opening a connection. Default 5. */
  connectTimeoutSeconds?: number;
};

export function createDb(databaseUrl: string, options: CreateDbOptions = {}) {
  const sql = postgres(databaseUrl, {
    max: options.max ?? 10,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>['db'];
