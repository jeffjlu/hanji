import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestClient } from '../../test/test-client.js';
import { createTestApp } from '../../test/app.js';
import { createSession, createUser, extendSession, findUserByEmail, type schema } from '@hanji/db';
import { findSessionsByUserId } from '@hanji/db/testing';
import { hashPassword } from '../auth/password.js';
import { getSessionExpiry, hashToken, SESSION_COOKIE_NAME } from '../auth/session.js';
import { currentUserResponseSchema } from '@hanji/schemas';

const ME_URL = '/api/v1/me';
const ME_EMAIL = 'me@example.com';
const ME_PASSWORD = 'this-is-a-valid-password';
const REGISTRATION_CODE = 'test-invite-code';

describe('GET /api/v1/me', () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;
  let user: schema.User;
  let testClient: TestClient;

  beforeAll(async () => {
    testApp = await createTestApp();
    const passwordHash = await hashPassword(ME_PASSWORD);
    const createUserResult = await createUser(testApp.db, { email: ME_EMAIL, passwordHash });
    if (!createUserResult.success) throw new Error('expected user creation to succeed');
    user = createUserResult.user;
  });

  beforeEach(async () => {
    testClient = new TestClient(testApp.app, testApp.config.WEB_ORIGIN);
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

    const res = await testClient.request({
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
    const res = await testClient.request({
      method: 'GET',
      url: ME_URL,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for an invalid token', async () => {
    const token = 'this-token-does-not-exist';

    const res = await testClient.request({
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

    const res = await testClient.request({
      method: 'GET',
      url: ME_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 when a session expires after registration', async () => {
    const email = 'session-expiry@example.com';

    // Registration creates a session and sets the session cookie.
    await testClient.registerAndLogin({
      email,
      password: ME_PASSWORD,
      inviteCode: REGISTRATION_CODE,
    });

    const user = await findUserByEmail(testApp.db, email);
    expect(user).toBeDefined();

    const sessions = await findSessionsByUserId(testApp.db, user!.id);
    expect(sessions).toHaveLength(1);

    // Expire the session in the database while the cookie is still valid.
    const expired = await extendSession(testApp.db, sessions[0]!.id, new Date(Date.now() - 1));
    expect(expired).toBeDefined();

    const res = await testClient.request({
      method: 'GET',
      url: ME_URL,
    });
    expect(res.statusCode).toBe(401);
  });
});
