import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app.js';
import { createSession, createUser, type schema } from '@hanji/db';
import { hashPassword } from '../auth/password.js';
import { getSessionExpiry, hashToken, SESSION_COOKIE_NAME } from '../auth/session.js';
import { currentUserResponseSchema } from '@hanji/schemas';

const ME_URL = '/api/v1/me';
const ME_EMAIL = 'me@example.com';
const ME_PASSWORD = 'this-is-a-valid-password';

describe('GET /api/v1/me', () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;
  let user: schema.User;

  beforeAll(async () => {
    testApp = await createTestApp();
    const passwordHash = await hashPassword(ME_PASSWORD);
    const createUserResult = await createUser(testApp.db, { email: ME_EMAIL, passwordHash });
    if (!createUserResult.success) throw new Error('expected user creation to succeed');
    user = createUserResult.user;
  });

  afterAll(async () => {
    await testApp.dispose();
  });

  it('should return 200 for a user with a valid session', async () => {
    const token = 'test-token';
    const tokenHash = hashToken(token);

    const session = await createSession(testApp.db, {
      userId: user.id,
      tokenHash,
      expiresAt: getSessionExpiry(new Date()),
    });
    if (!session) throw new Error('expected session creation to succeed');

    const res = await testApp.app.inject({
      method: 'GET',
      url: ME_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(currentUserResponseSchema.safeParse(body.user).success).toBe(true);
    expect(body.user).toEqual({
      id: user.id,
      email: user.email,
    });

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(ME_PASSWORD);
  });

  it('should return 401 for a request without a token cookie', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: ME_URL,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for an invalid token', async () => {
    const token = 'this-token-does-not-exist';

    const res = await testApp.app.inject({
      method: 'GET',
      url: ME_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for an expired token', async () => {
    const token = 'this-token-is-expired';
    const tokenHash = hashToken(token);

    const session = await createSession(testApp.db, {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1),
    });
    if (!session) throw new Error('expected session creation to succeed');

    const res = await testApp.app.inject({
      method: 'GET',
      url: ME_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
