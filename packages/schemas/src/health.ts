import { z } from 'zod';

/**
 * Response of GET /api/v1/health.
 * 200 with { status: "ok", db: "up" }, or 503 with { status: "degraded", db: "down" }.
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
