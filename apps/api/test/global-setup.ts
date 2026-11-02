import { env } from 'process';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

type ProvidedProject = {
  provide: (key: string, value: unknown) => void;
};

/**
 * Starts one PostgreSQL server per test run (or reuses TEST_DATABASE_URL when set)
 * and provides the admin connection URL to every test file via `inject('adminDatabaseUrl')`.
 */
export default async function globalSetup(project: ProvidedProject): Promise<() => Promise<void>> {
  const adminDatabaseUrl = env['TEST_DATABASE_URL'];
  let container: StartedPostgreSqlContainer | undefined;

  if (!adminDatabaseUrl) {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    project.provide('adminDatabaseUrl', container.getConnectionUri());
  } else {
    project.provide('adminDatabaseUrl', adminDatabaseUrl);
  }

  return async () => {
    if (container) {
      await container.stop();
    }
  };
}
