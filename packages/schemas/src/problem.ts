import { z } from 'zod';

/** One field-level validation problem, returned with 400 responses. */
export const fieldProblemSchema = z.object({
  /** Dotted path to the offending field, for example "email" or "events.0.rating". */
  field: z.string(),
  message: z.string(),
});
export type FieldProblem = z.infer<typeof fieldProblemSchema>;

/**
 * Error body for every non-2xx API response (Content-Type: application/problem+json, RFC 9457).
 * Stack traces never appear here.
 */
export const problemDetailsSchema = z.object({
  /** A URI reference identifying the problem type; "about:blank" when there is nothing more specific. */
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** The request id also sent in the response header, for matching log lines. */
  requestId: z.string().optional(),
  /** Present on 400 responses from request validation. */
  errors: z.array(fieldProblemSchema).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
