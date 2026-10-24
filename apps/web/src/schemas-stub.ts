import {
  PASSWORD_MIN_LENGTH,
  currentUserResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  problemDetailsSchema,
  registerRequestSchema,
  type CurrentUserResponse,
  type HealthResponse,
  type LoginRequest,
  type RegisterRequest,
} from '@hanji/schemas';

/**
 * Stub that proves apps/web can import and use @hanji/schemas (P0-02).
 * Replace it with the real form logic in P0-09.
 */

/** Field name to message. Absent key means the field is valid. */
export type FieldErrors = Partial<Record<string, string>>;

export type FormResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

type Issues = ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;

/** Keep the first message per field, which is what a form shows under the input. */
function collect(issues: Issues): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path.map(String).join('.');
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Compile-time check: if registerRequestSchema changes shape, this stops type-checking. */
export const exampleRegister: RegisterRequest = {
  email: 'learner@example.com',
  password: 'correct horse battery',
  inviteCode: 'let-me-in',
};

export const passwordHint = `At least ${PASSWORD_MIN_LENGTH} characters`;

/** Client-side validation of the register form, using the same schema the API enforces. */
export function validateRegisterForm(values: {
  email: string;
  password: string;
  inviteCode: string;
}): FormResult<RegisterRequest> {
  const result = registerRequestSchema.safeParse(values);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: collect(result.error.issues) };
}

export function validateLoginForm(values: {
  email: string;
  password: string;
}): FormResult<LoginRequest> {
  const result = loginRequestSchema.safeParse(values);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: collect(result.error.issues) };
}

/** Turn an API problem+json body into the same field-to-message map the form shows. */
export function fieldErrorsFromProblem(json: unknown): FieldErrors {
  const problem = problemDetailsSchema.safeParse(json);
  if (!problem.success || problem.data.errors === undefined) return {};
  const errors: FieldErrors = {};
  for (const { field, message } of problem.data.errors) errors[field] ??= message;
  return errors;
}

/** Parse GET /api/v1/me. Returns null when the body is not a valid current-user response. */
export function parseCurrentUser(json: unknown): CurrentUserResponse | null {
  const result = currentUserResponseSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Parse GET /api/v1/health. Returns null when the body does not match the contract. */
export function parseHealth(json: unknown): HealthResponse | null {
  const result = healthResponseSchema.safeParse(json);
  return result.success ? result.data : null;
}
