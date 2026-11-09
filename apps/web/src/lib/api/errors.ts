import type { ProblemDetails } from '@hanji/schemas';

export type FieldErrors = Record<string, string[]>;

/**
 * Converts API field problems into a map keyed by field name.
 *
 * Multiple messages for the same field are preserved.
 */
export function problemToFieldErrors(problem: Pick<ProblemDetails, 'errors'>): FieldErrors {
  const fieldErrors: FieldErrors = Object.create(null);

  for (const { field, message } of problem.errors ?? []) {
    fieldErrors[field] ??= [];
    fieldErrors[field].push(message);
  }

  return fieldErrors;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly fieldErrors: FieldErrors
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/**
 * Represents a failure to communicate with the API.
 */
export class NetworkError extends Error {
  constructor() {
    super('Unable to connect. Please check your connection and try again.');
    this.name = 'NetworkError';
  }
}

/**
 * Represents an unexpected or malformed API response.
 */
export class ApiResponseError extends Error {
  constructor() {
    super('The server returned an unexpected response. Please try again.');
    this.name = 'ApiResponseError';
  }
}
