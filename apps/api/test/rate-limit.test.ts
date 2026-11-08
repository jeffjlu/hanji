import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { describe, expect, it } from 'vitest';
import { errorHandler, HttpError } from '../src/errors.js';
import { type ProblemDetails } from '@hanji/schemas';

const DUMMY_URL = '/dummy';

/**
 * Builds a minimal, database-free Fastify app that registers only the rate-limit
 * plugin (opt-in, not global), the shared error handler and a single dummy route
 * that opts into limiting. Each call returns a fresh app with a fresh in-memory
 * store so counters never leak between tests.
 */
async function buildRateLimitApp({
  max = 2,
  timeWindow = 60_000,
}: { max?: number; timeWindow?: number } = {}) {
  const app = Fastify({ logger: { level: 'silent' } });
  app.setErrorHandler(errorHandler);

  await app.register(rateLimit, {
    global: false,
    max,
    timeWindow,
    errorResponseBuilder: () => new HttpError(429, 'Rate limit exceeded. Please try again later.'),
  });

  app.post(DUMMY_URL, { config: { rateLimit: {} } }, async () => ({ ok: true }));

  return app;
}

async function postDummy(
  app: Awaited<ReturnType<typeof buildRateLimitApp>>,
  remoteAddress: string,
  headers?: Record<string, string>
) {
  return app.inject({ method: 'POST', url: DUMMY_URL, remoteAddress, headers });
}

describe('rate limit (isolated plugin behaviour)', () => {
  it('allows requests up to max, then replies 429 with problem+json and Retry-After', async () => {
    const app = await buildRateLimitApp({ max: 2 });

    // The first two requests from the same IP are allowed.
    for (let i = 0; i < 2; i++) {
      const res = await postDummy(app, '10.0.0.1');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    }

    // The third request is rate limited.
    const res = await postDummy(app, '10.0.0.1');
    expect(res.statusCode).toBe(429);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

    const body = res.json() as ProblemDetails;
    expect(body.type).toBe('about:blank');
    expect(body.title).toBe('Too Many Requests');
    expect(body.status).toBe(429);
    expect(body.detail).toBe('Rate limit exceeded. Please try again later.');
    expect(body.requestId).toBeDefined();

    await app.close();
  });

  it('counts requests per IP address', async () => {
    const app = await buildRateLimitApp({ max: 2 });

    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';

    // IP A exhausts its own counter.
    await postDummy(app, ipA);
    await postDummy(app, ipA);
    expect((await postDummy(app, ipA)).statusCode).toBe(429);

    // IP B has a separate counter and is still allowed.
    expect((await postDummy(app, ipB)).statusCode).toBe(200);

    await app.close();
  });

  it('ignores X-Forwarded-For and counts by the direct client IP', async () => {
    const app = await buildRateLimitApp({ max: 2 });

    const ip = '10.0.0.1';

    // Two requests from the direct IP, each claiming a different X-Forwarded-For.
    await postDummy(app, ip, { 'x-forwarded-for': '9.9.9.9' });
    await postDummy(app, ip, { 'x-forwarded-for': '9.9.9.9' });

    // A third request from the same direct IP is limited even though it now
    // claims a different X-Forwarded-For, proving X-Forwarded-For is not the key.
    const res = await postDummy(app, ip, { 'x-forwarded-for': '8.8.8.8' });
    expect(res.statusCode).toBe(429);

    await app.close();
  });
});
