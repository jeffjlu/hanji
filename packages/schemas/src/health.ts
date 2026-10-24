import { z } from 'zod';

/**
 * Response of GET /api/v1/health.
 * 200 with { status: "ok", db: "up" }, or 503 with { status: "degraded", db: "down" }.
 */
const okResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('up'),
});
const degradedResponseSchema = z.object({
  status: z.literal('degraded'),
  db: z.literal('down'),
});

export const healthResponseSchema = z.union([okResponseSchema, degradedResponseSchema]);

export type HealthResponse = z.infer<typeof healthResponseSchema>;
