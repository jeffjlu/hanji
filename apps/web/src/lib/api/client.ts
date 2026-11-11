import {
  currentUserResponseSchema,
  problemDetailsSchema,
  type LoginRequest,
  type RegisterRequest,
  type CurrentUserResponse,
} from '@hanji/schemas';

import { ApiError, ApiResponseError, NetworkError, problemToFieldErrors } from './errors';

const API_BASE = '/api/v1';

type RequestOptions = {
  method: 'GET' | 'POST';
  body?: unknown;
};

async function request(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers({
    Accept: 'application/json, application/problem+json',
  });

  let body: string | undefined;

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method,
      headers,
      body,
      credentials: 'include',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new NetworkError();
  }

  if (!response.ok) {
    const problem = problemDetailsSchema.safeParse(await response.json().catch(() => null));

    if (problem.success) {
      throw new ApiError(
        response.status,
        problem.data.detail ?? problem.data.title,
        problemToFieldErrors(problem.data)
      );
    }

    throw new ApiError(response.status, response.statusText || 'Something went wrong.', {});
  }

  return response;
}

/**
 * Requests an endpoint that returns a current-user response.
 */
async function requestUser(path: string, options: RequestOptions): Promise<CurrentUserResponse> {
  const response = await request(path, options);

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ApiResponseError();
  }

  if (typeof body !== 'object' || body === null || !('user' in body)) {
    throw new ApiResponseError();
  }

  const user = currentUserResponseSchema.safeParse(body.user);

  if (!user.success) {
    throw new ApiResponseError();
  }

  return user.data;
}

export function getMe(): Promise<CurrentUserResponse> {
  return requestUser('/me', {
    method: 'GET',
  });
}

export function register(input: RegisterRequest): Promise<CurrentUserResponse> {
  return requestUser('/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function login(input: LoginRequest): Promise<CurrentUserResponse> {
  return requestUser('/auth/login', {
    method: 'POST',
    body: input,
  });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', {
    method: 'POST',
  });
}
