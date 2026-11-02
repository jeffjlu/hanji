import { createDb, type Database } from './client.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const DEFAULT_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function migrateDatabase(database: Database, folder = DEFAULT_FOLDER): Promise<void> {
  if (!existsSync(folder)) return;
  await migrate(database, { migrationsFolder: folder });
}

export async function migrateDatabaseFromURL(databaseUrl: string, folder?: string): Promise<void> {
  const { db, close } = createDb(databaseUrl, { max: 1 });
  try {
    await migrateDatabase(db, folder);
  } finally {
    await close();
  }
}
