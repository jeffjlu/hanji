import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Sql } from '@hanji/db';
import { healthRoutes } from './health.js';
import { healthResponseSchema } from '@hanji/schemas';

const apps: FastifyInstance[] = [];

/**
 * A sql tagged-template client whose trivial query resolves (up) or rejects
 * (down) after `delayMs`. Used to exercise the route without a real database.
 */
function fakeSql(up: boolean, delayMs = 0): Sql {
  const query = () =>
    new Promise<boolean>((resolve, reject) => {
      setTimeout(() => (up ? resolve(true) : reject(new Error('db down'))), delayMs);
    });
  // sql`select 1` — a tagged-template callable returning a promise.
  const sql = ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    query()) as unknown as Sql;
  return sql;
}

async function buildTestApp(sql: Sql) {
  const app = Fastify();
  apps.push(app);
  await app.register(healthRoutes(sql), { prefix: '/api/v1' });
  await app.ready();
  return app;
}

afterEach(async () => {
  // Ensure that all Fastify instances are closed after each test to avoid resource leaks.
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /api/v1/health', () => {
  it('returns 200 with { status: "ok", db: "up" } when the database is reachable', async () => {
    const app = await buildTestApp(fakeSql(true));
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json()).toEqual({ status: 'ok', db: 'up' });
  });

  it('returns 503 with { status: "degraded", db: "down" } when the database is unreachable', async () => {
    const app = await buildTestApp(fakeSql(false));
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(healthResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json()).toEqual({ status: 'degraded', db: 'down' });
  });

  it('responds within 2 seconds when the database is unreachable', async () => {
    // The database would take 5s to answer, but the health check must not wait for it.
    const app = await buildTestApp(fakeSql(false, 5000));
    const start = Date.now();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const elapsed = Date.now() - start;
    expect(res.statusCode).toBe(503);
    expect(elapsed).toBeGreaterThan(1800);
    expect(elapsed).toBeLessThan(3000);
  });
});
