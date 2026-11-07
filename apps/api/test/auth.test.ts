import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { requireAuth } from '../src/auth/require-auth.js';
import { findSessionByTokenHash, extendSession, type DbHandle } from '@hanji/db';
import { buildTestConfig } from './app.js';
import { type Config } from '../src/config.js';
import { hashToken, SESSION_COOKIE_NAME, SESSION_LIFETIME_DAYS } from '../src/auth/session.js';
import { type FastifyCookieOptions } from '@fastify/cookie';

vi.mock('@hanji/db', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    findSessionByTokenHash: vi.fn(),
    extendSession: vi.fn(),
  };
});

const config: Config = buildTestConfig();
const now = () => new Date('2026-01-01T00:00:00Z');
const mockDatabase: DbHandle = {
  db: {} as DbHandle['db'],
  sql: {} as DbHandle['sql'],
  close: vi.fn().mockResolvedValue(undefined),
};
const deps = { ...mockDatabase, config, now };

function makeRequest(token?: string): FastifyRequest {
  return {
    cookies: token ? { token } : {},
  } as unknown as FastifyRequest;
}

function makeReply() {
  const setCookies: Array<{ name: string; value: string; options?: FastifyCookieOptions }> = [];
  return {
    setCookie(name: string, value: string, options?: FastifyCookieOptions) {
      setCookies.push({ name, value, options });
    },
    get cookies() {
      return setCookies;
    },
  } as unknown as FastifyReply;
}

const baseSession = (overrides: { expiresAt?: Date } = {}) => ({
  id: 'session-1',
  userId: 'user-1',
  tokenHash: 'hashed-token',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-01-31T00:00:00Z'),
  user: { id: 'user-1', email: 'user@example.com' },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('requireAuth', () => {
  it('throws HttpError 401 when there is no token cookie', async () => {
    const request = makeRequest();
    const reply = makeReply();
    const hook = requireAuth(deps);

    await expect(hook(request, reply)).rejects.toMatchObject({
      statusCode: 401,
      detail: 'Unauthorized',
    });
    expect(findSessionByTokenHash).not.toHaveBeenCalled();
    expect(extendSession).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('throws HttpError 401 when no session matches the token hash', async () => {
    vi.mocked(findSessionByTokenHash).mockResolvedValue(undefined);
    const request = makeRequest('some-token');
    const reply = makeReply();
    const hook = requireAuth(deps);

    await expect(hook(request, reply)).rejects.toMatchObject({
      statusCode: 401,
      detail: 'Unauthorized',
    });
    expect(findSessionByTokenHash).toHaveBeenCalledTimes(1);
    expect(findSessionByTokenHash).toHaveBeenCalledWith(deps.db, hashToken('some-token'));
    expect(extendSession).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('throws HttpError 401 when the session is expired', async () => {
    vi.mocked(findSessionByTokenHash).mockResolvedValue(
      baseSession({ expiresAt: new Date('2025-12-01T00:00:00Z') })
    );
    const request = makeRequest('some-token');
    const reply = makeReply();
    const hook = requireAuth(deps);

    await expect(hook(request, reply)).rejects.toMatchObject({
      statusCode: 401,
      detail: 'Unauthorized',
    });
    expect(extendSession).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('sets request.user for a valid session that is not due for extension', async () => {
    vi.mocked(findSessionByTokenHash).mockResolvedValue(baseSession());
    const request = makeRequest('some-token');
    const reply = makeReply();
    const hook = requireAuth(deps);

    const result = await hook(request, reply);

    expect(result).toBeUndefined();
    expect(request.user).toEqual({ id: 'user-1', email: 'user@example.com' });
    expect(extendSession).not.toHaveBeenCalled();
    expect(reply.cookies).toHaveLength(0);
  });

  it('extends the session and sets a cookie when it is within the extension threshold', async () => {
    // Expires 10 days from now — inside the 15-day extension threshold.
    vi.mocked(findSessionByTokenHash).mockResolvedValue(
      baseSession({ expiresAt: new Date('2026-01-11T00:00:00Z') })
    );
    vi.mocked(extendSession).mockResolvedValue(baseSession());
    const request = makeRequest('some-token');
    const reply = makeReply();
    const hook = requireAuth(deps);

    await hook(request, reply);

    expect(extendSession).toHaveBeenCalledTimes(1);
    expect(extendSession).toHaveBeenCalledWith(
      deps.db,
      'session-1',
      new Date('2026-01-31T00:00:00Z')
    );
    expect(reply.cookies).toHaveLength(1);
    expect(reply.cookies[0]).toMatchObject({
      name: SESSION_COOKIE_NAME,
      value: 'some-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: SESSION_LIFETIME_DAYS * 24 * 60 * 60,
      },
    });
  });
});
