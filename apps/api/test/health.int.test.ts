import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '@hanji/db';
import { buildApp } from '../src/app.js';
import { buildTestConfig, createTestApp } from './app.js';

const HEALTH_ENDPOINT = '/api/v1/health';

describe('GET /api/v1/health', () => {
  describe('with a healthy database', () => {
    let testApp: Awaited<ReturnType<typeof createTestApp>>;

    beforeAll(async () => {
      testApp = await createTestApp();
    });
    afterAll(async () => {
      await testApp.dispose();
    });

    it('returns 200 with { status: "ok", db: "up" }', async () => {
      const res = await testApp.app.inject({ method: 'GET', url: HEALTH_ENDPOINT });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok', db: 'up' });
    });
  });

  describe('with an unreachable database', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeAll(async () => {
      // Nothing listens on port 1, so every connection attempt fails.
      app = await buildApp({
        ...createDb('postgres://u:p@127.0.0.1:1/none', { connectTimeoutSeconds: 1 }),
        config: buildTestConfig(),
        now: () => new Date(),
      });
    });
    afterAll(async () => {
      await app.close();
    });

    it('returns 503 with { status: "degraded", db: "down" } within 2.5 seconds', async () => {
      const start = Date.now();
      const res = await app.inject({ method: 'GET', url: HEALTH_ENDPOINT });
      expect(Date.now() - start).toBeLessThan(2500);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'degraded', db: 'down' });
    });
  });
});
