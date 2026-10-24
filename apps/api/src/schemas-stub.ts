import {
  currentUserResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  problemDetailsSchema,
  registerRequestSchema,
  type CurrentUserResponse,
  type HealthResponse,
  type LoginRequest,
  type ProblemDetails,
  type RegisterRequest,
} from '@hanji/schemas';

/**
 * Stub that proves apps/api can import and use @hanji/schemas (P0-02).
 * Replace it with the real route handlers in P0-04 and P0-07.
 */

/** Minimal structural view of a Zod schema, so the API needs no zod dependency of its own. */
type Parser<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
      };
};

export type ParseResult<T> =
  { ok: true; data: T } | { ok: false; status: 400; problem: ProblemDetails };

/** Compile-time check: if registerRequestSchema changes shape, this stops type-checking. */
export const exampleRegister: RegisterRequest = {
  email: 'learner@example.com',
  password: 'correct horse battery',
  inviteCode: 'let-me-in',
};

/** Validate a request body. On failure, build the application/problem+json body with field-level errors. */
export function parseBody<T>(schema: Parser<T>, body: unknown, requestId?: string): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };

  const problem = problemDetailsSchema.parse({
    type: 'about:blank',
    title: 'Bad Request',
    status: 400,
    detail: 'Request validation failed',
    ...(requestId === undefined ? {} : { requestId }),
    errors: result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
  return { ok: false, status: 400, problem };
}

export function parseRegisterBody(body: unknown, requestId?: string): ParseResult<RegisterRequest> {
  return parseBody<RegisterRequest>(registerRequestSchema, body, requestId);
}

export function parseLoginBody(body: unknown, requestId?: string): ParseResult<LoginRequest> {
  return parseBody<LoginRequest>(loginRequestSchema, body, requestId);
}

/** GET /api/v1/health. The reply body is validated too, so the handler cannot drift from the shared contract. */
export function buildHealthReply(dbUp: boolean): { statusCode: 200 | 503; body: HealthResponse } {
  return dbUp
    ? { statusCode: 200, body: healthResponseSchema.parse({ status: 'ok', db: 'up' }) }
    : { statusCode: 503, body: healthResponseSchema.parse({ status: 'degraded', db: 'down' }) };
}

/** Shape a user row for GET /api/v1/me. parse() strips fields that must never leave the server. */
export function toCurrentUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  lastSeq: number;
}): CurrentUserResponse {
  return currentUserResponseSchema.parse(row);
}
