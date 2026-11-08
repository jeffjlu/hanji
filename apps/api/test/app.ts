import { loadConfig, type Config } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { createTestDatabase } from '@hanji/db/testing';

type Env = Record<string, string | undefined>;
type TestApp = {
  app: Awaited<ReturnType<typeof buildApp>>;
  config: Config;
  db: Awaited<ReturnType<typeof createTestDatabase>>['db'];
  sql: Awaited<ReturnType<typeof createTestDatabase>>['sql'];
  dispose: () => Promise<void>;
};

export function buildTestConfig(env: Env = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/unused',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    WEB_ORIGIN: 'http://localhost:5173',
    REGISTRATION_CODE: 'test-invite-code',
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_WINDOW_SECONDS: '60',
    ...env,
  });
}

export async function createTestApp(
  options: { env?: Env; now?: () => Date } = {}
): Promise<TestApp> {
  const testDb = await createTestDatabase();
  try {
    const config = buildTestConfig({ DATABASE_URL: testDb.databaseURL, ...options.env });

    // The test database owns the pool, so the app gets a no-op close.
    const app = await buildApp({
      db: testDb.db,
      sql: testDb.sql,
      close: async () => {},
      config: config,
      now: options.now ?? (() => new Date()),
    });

    return {
      app,
      config,
      db: testDb.db,
      sql: testDb.sql,
      dispose: async () => {
        try {
          await app.close();
        } finally {
          await testDb.dispose();
        }
      },
    };
  } catch (err) {
    await testDb.dispose();
    throw err;
  }
}
