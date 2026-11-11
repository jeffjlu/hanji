import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiResponseError, NetworkError } from './errors';
import { getMe, login, logout, register } from './client';
import { problemToFieldErrors } from './errors';

const API_BASE = '/api/v1';
const USER_ID = '3f2b8c1e-5d4a-4e7b-9a1c-2d3e4f5a6b7c';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchResponse(response: Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function mockFetchReject(error: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockRejectedValue(error);
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('problemToFieldErrors', () => {
  it('groups every message under its field, preserving duplicates', () => {
    const problem = {
      errors: [
        { field: 'email', message: 'Already registered' },
        { field: 'email', message: 'Must be a valid email address' },
        { field: 'password', message: 'Too short' },
      ],
    };
    expect(problemToFieldErrors(problem)).toEqual({
      email: ['Already registered', 'Must be a valid email address'],
      password: ['Too short'],
    });
  });

  it('returns an empty object when there are no errors', () => {
    expect(problemToFieldErrors({ errors: [] })).toEqual({});
    expect(problemToFieldErrors({})).toEqual({});
  });
});

describe('ApiError', () => {
  it('carries the status, detail, and field errors', () => {
    const error = new ApiError(409, 'The email is taken.', { email: ['Already registered'] });

    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(409);
    expect(error.detail).toBe('The email is taken.');
    expect(error.fieldErrors).toEqual({ email: ['Already registered'] });
  });
});

describe('client error handling', () => {
  it('throws NetworkError when the network request fails (offline)', async () => {
    mockFetchReject(new TypeError('Failed to fetch'));
    await expect(getMe()).rejects.toBeInstanceOf(NetworkError);
  });

  it('rethrown AbortError unchanged instead of NetworkError', async () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    mockFetchReject(abortError);
    await expect(getMe()).rejects.toBe(abortError);
  });

  it('throws ApiError for a non-JSON error body', async () => {
    mockFetchResponse(
      new Response('<html><body>Internal Server Error</body></html>', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/html' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 500,
        detail: 'Internal Server Error',
        fieldErrors: {},
      });
    }
  });

  it('falls back to statusText when the JSON body is not a problem shape', async () => {
    mockFetchResponse(
      new Response('{}', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 500,
        detail: 'Internal Server Error',
        fieldErrors: {},
      });
    }
  });

  it('falls back to a generic message when statusText is empty', async () => {
    mockFetchResponse(
      new Response('{}', {
        status: 500,
        statusText: '',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 500,
        detail: 'Something went wrong.',
        fieldErrors: {},
      });
    }
  });

  it('throws ApiError with status 401 for a 401 problem', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid credentials.',
      requestId: 'req_401',
    };
    mockFetchResponse(
      new Response(JSON.stringify(problem), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 401,
        detail: 'Invalid credentials.',
        fieldErrors: {},
      });
    }
  });

  it('throws ApiError with detail and field errors from a 409 problem', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The email is already registered.',
      requestId: 'req_409',
      errors: [{ field: 'email', message: 'Already registered' }],
    };
    mockFetchResponse(
      new Response(JSON.stringify(problem), {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 409,
        detail: 'The email is already registered.',
        fieldErrors: { email: ['Already registered'] },
      });
    }
  });

  it('throws ApiError with detail and field errors from a 400 problem', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed.',
      requestId: 'req_400',
      errors: [
        { field: 'email', message: 'Must be a valid email address' },
        { field: 'password', message: 'Too short' },
      ],
    };
    mockFetchResponse(
      new Response(JSON.stringify(problem), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );
    try {
      await getMe();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        detail: 'Validation failed.',
        fieldErrors: {
          email: ['Must be a valid email address'],
          password: ['Too short'],
        },
      });
    }
  });

  it('throws ApiResponseError when a 200 body is not valid JSON', async () => {
    mockFetchResponse(
      new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(getMe()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('throws ApiResponseError when a 200 body fails the user schema', async () => {
    mockFetchResponse(
      new Response(JSON.stringify({ user: { id: 'not-a-uuid' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(getMe()).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('returns the current user when the response is valid', async () => {
    const mock = mockFetchResponse(
      new Response(JSON.stringify({ user: { id: USER_ID, email: 'learner@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(getMe()).resolves.toEqual({ id: USER_ID, email: 'learner@example.com' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe('register', () => {
  it('POSTs the register body to /api/v1/auth/register as JSON', async () => {
    const mock = mockFetchResponse(
      new Response(JSON.stringify({ user: { id: USER_ID, email: 'learner@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await register({
      email: 'learner@example.com',
      password: 'correct horse battery',
      inviteCode: 'let-me-in',
    });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/auth/register`);
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(
      JSON.stringify({
        email: 'learner@example.com',
        password: 'correct horse battery',
        inviteCode: 'let-me-in',
      })
    );
  });
});

describe('login', () => {
  it('POSTs the login body to /api/v1/auth/login as JSON', async () => {
    const mock = mockFetchResponse(
      new Response(JSON.stringify({ user: { id: USER_ID, email: 'learner@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await login({ email: 'a@b.co', password: 'x' });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/auth/login`);
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'x' }));
  });
});

describe('logout', () => {
  it('POSTs to /api/v1/auth/logout with no body', async () => {
    const mock = mockFetchResponse(new Response(null, { status: 204 }));
    await logout();
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/auth/logout`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('resolves on an empty 204 response', async () => {
    mockFetchResponse(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
  });
});
