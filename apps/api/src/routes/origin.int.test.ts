import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app.js';
import { hashPassword } from '../auth/password.js';
import { createSession, createUser, findUserByEmail } from '@hanji/db';
import { getSessionExpiry, hashToken, SESSION_COOKIE_NAME } from '../auth/session.js';
import { findSessionsByUserId } from '@hanji/db/testing';
import { TestClient } from '../../test/test-client.js';

const REGISTRATION_CODE = 'test-invite-code';
const AUTH_PREFIX = '/api/v1/auth';
const REGISTER_URL = `${AUTH_PREFIX}/register`;
const LOGIN_URL = `${AUTH_PREFIX}/login`;
const LOGOUT_URL = `${AUTH_PREFIX}/logout`;
const HEALTH_URL = '/api/v1/health';

const WEB_ORIGIN = 'http://localhost:5173';
const WRONG_ORIGIN = 'http://evil.example.com';
const TEST_PASSWORD = 'thisIsALongEnoughPassword';

async function createUserWithSession(
  db: Awaited<ReturnType<typeof createTestApp>>['db'],
  email: string,
  token: string
) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const result = await createUser(db, { email, passwordHash });
  if (!result.success) throw new Error('Failed to create test user');
  const tokenHash = hashToken(token);
  await createSession(db, {
    userId: result.user.id,
    tokenHash,
    expiresAt: getSessionExpiry(new Date()),
  });
}

describe('Origin check', () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;
  let testClient: TestClient;

  beforeAll(async () => {
    testApp = await createTestApp({ env: { REGISTRATION_CODE } });
  });

  beforeEach(async () => {
    testClient = new TestClient(testApp.app, WEB_ORIGIN);
  });

  afterAll(async () => {
    await testApp.dispose();
  });

  describe('state-changing routes (register, login, logout)', () => {
    it('rejects register with a wrong origin (403) and creates no user', async () => {
      const res = await testClient.request({
        method: 'POST',
        url: REGISTER_URL,
        origin: WRONG_ORIGIN,
        payload: {
          email: 'origin-register@example.com',
          password: TEST_PASSWORD,
          inviteCode: REGISTRATION_CODE,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(await findUserByEmail(testApp.db, 'origin-register@example.com')).toBeUndefined();
    });

    it('allows register with the right origin (201)', async () => {
      const res = await testClient.request({
        method: 'POST',
        url: REGISTER_URL,
        origin: WEB_ORIGIN,
        payload: {
          email: 'origin-register-right@example.com',
          password: TEST_PASSWORD,
          inviteCode: REGISTRATION_CODE,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(await findUserByEmail(testApp.db, 'origin-register-right@example.com')).toBeDefined();
    });

    it('rejects login with a wrong origin (403): no session, no Set-Cookie', async () => {
      const email = 'origin-login@example.com';
      await createUser(testApp.db, {
        email,
        passwordHash: await hashPassword(TEST_PASSWORD),
      });

      const user = await findUserByEmail(testApp.db, email);
      const sessionsBefore = await findSessionsByUserId(testApp.db, user!.id);

      const res = await testClient.request({
        method: 'POST',
        url: LOGIN_URL,
        origin: WRONG_ORIGIN,
        payload: { email, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['set-cookie']).toBeUndefined();

      const sessionsAfter = await findSessionsByUserId(testApp.db, user!.id);
      expect(sessionsAfter).toEqual(sessionsBefore);
    });

    it('allows login with the right origin (200) and issues a Set-Cookie', async () => {
      const email = 'origin-login-right@example.com';
      await createUser(testApp.db, {
        email,
        passwordHash: await hashPassword(TEST_PASSWORD),
      });

      const res = await testClient.request({
        method: 'POST',
        url: LOGIN_URL,
        origin: WEB_ORIGIN,
        payload: { email, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie']).toContain(SESSION_COOKIE_NAME);
    });

    it('rejects logout with a wrong origin (403) and the session survives', async () => {
      const email = 'origin-logout@example.com';
      await createUserWithSession(testApp.db, email, 'origin-logout-token');
      const userId = (await findUserByEmail(testApp.db, email))!.id;
      const sessionsBefore = await findSessionsByUserId(testApp.db, userId);

      const res = await testClient.request({
        method: 'POST',
        url: LOGOUT_URL,
        origin: WRONG_ORIGIN,
        cookies: { [SESSION_COOKIE_NAME]: 'origin-logout-token' },
      });

      expect(res.statusCode).toBe(403);
      const sessionsAfter = await findSessionsByUserId(testApp.db, userId);
      expect(sessionsAfter).toEqual(sessionsBefore);
    });

    it('allows logout with the right origin (204) and deletes the session', async () => {
      const email = 'origin-logout-right@example.com';
      await createUserWithSession(testApp.db, email, 'origin-logout-right-token');
      const userId = (await findUserByEmail(testApp.db, email))!.id;

      const res = await testClient.request({
        method: 'POST',
        url: LOGOUT_URL,
        origin: WEB_ORIGIN,
        cookies: { [SESSION_COOKIE_NAME]: 'origin-logout-right-token' },
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(await findSessionsByUserId(testApp.db, userId)).toHaveLength(0);
    });

    it('rejects a PATCH request with a wrong origin (403)', async () => {
      const res = await testClient.request({
        method: 'PATCH',
        url: LOGOUT_URL,
        origin: WRONG_ORIGIN,
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Referer fallback (Origin absent)', () => {
    it('allows a state-changing request when Referer matches and Origin is absent', async () => {
      const res = await testClient.request({
        method: 'POST',
        url: REGISTER_URL,
        origin: null,
        headers: { referer: 'http://localhost:5173/register' },
        payload: {
          email: 'referer-register@example.com',
          password: TEST_PASSWORD,
          inviteCode: REGISTRATION_CODE,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(await findUserByEmail(testApp.db, 'referer-register@example.com')).toBeDefined();
    });

    it('rejects a state-changing request when neither Origin nor Referer is present', async () => {
      const res = await testClient.request({
        method: 'POST',
        url: REGISTER_URL,
        origin: null,
        payload: {
          email: 'no-header-register@example.com',
          password: TEST_PASSWORD,
          inviteCode: REGISTRATION_CODE,
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET routes are unaffected by origin', () => {
    it('GET /health is allowed without Origin or Referer', async () => {
      const res = await testClient.request({ method: 'GET', url: HEALTH_URL });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok', db: 'up' });
    });

    it('GET /health is allowed even with a wrong origin', async () => {
      const res = await testClient.request({
        method: 'GET',
        url: HEALTH_URL,
        origin: WRONG_ORIGIN,
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('403 responses use problem+json', () => {
    it('returns application/problem+json with a stable shape for a rejected origin', async () => {
      const res = await testClient.request({
        method: 'POST',
        url: REGISTER_URL,
        origin: WRONG_ORIGIN,
        payload: {
          email: 'origin-problem@example.com',
          password: TEST_PASSWORD,
          inviteCode: REGISTRATION_CODE,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json();
      expect(body).toMatchObject({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
      });
      expect(body.requestId).toBeDefined();
    });
  });
});
