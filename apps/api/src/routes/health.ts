import { type HealthResponse } from '@hanji/schemas';
import { type Sql } from '@hanji/db';
import { type FastifyPluginAsync, type FastifyInstance } from 'fastify';

/**
 * GET /health — no authentication required.
 *
 * Returns 200 with { status: 'ok', db: 'up' } when a trivial query succeeds,
 * or 503 with { status: 'degraded', db: 'down' } within 2 seconds when the
 * database is unreachable. The reply body always matches the shared
 * healthResponseSchema contract.
 */
export function healthRoutes(sql: Sql): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.get('/health', async (_request, reply) => {
      const up = await dbIsUp(sql);
      const body: HealthResponse = up
        ? { status: 'ok', db: 'up' }
        : { status: 'degraded', db: 'down' };

      return reply.code(up ? 200 : 503).send(body);
    });
  };
}

async function dbIsUp(sql: Sql, timeoutMs = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = sql`select 1`.then(
    () => true as const,
    () => false as const
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
