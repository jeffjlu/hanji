import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app.js';
import { hashPassword } from '../auth/password.js';
import { getSessionExpiry, hashToken } from '../auth/session.js';
import { createSession, createUser, findUserByEmail } from '@hanji/db';
import { SESSION_COOKIE_NAME, SESSION_LIFETIME_DAYS } from '../auth/session.js';
import { findSessionCount, findSessionsByUserId } from '@hanji/db/testing';

const REGISTRATION_CODE = 'test-invite-code';
const AUTH_PREFIX = '/api/v1/auth';
const REGISTER_URL = `${AUTH_PREFIX}/register`;
const LOGIN_URL = `${AUTH_PREFIX}/login`;
const LOGOUT_URL = `${AUTH_PREFIX}/logout`;

const REGISTER_EMAIL = 'register@example.com';
const LOGIN_EMAIL = 'login@example.com';
const LOGOUT_EMAIL = 'logout@example.com';
const TEST_PASSWORD = 'thisIsALongEnoughPassword';

function registerPayload(
  overrides: Partial<{ email: string; password: string; inviteCode: string }> = {}
) {
  return {
    email: REGISTER_EMAIL,
    password: TEST_PASSWORD,
    inviteCode: REGISTRATION_CODE,
    ...overrides,
  };
}

function loginPayload(overrides: Partial<{ email: string; password: string }> = {}) {
  return {
    email: LOGIN_EMAIL,
    password: TEST_PASSWORD,
    ...overrides,
  };
}

let testApp: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  testApp = await createTestApp({
    env: { REGISTRATION_CODE },
  });
});

afterAll(async () => {
  await testApp.dispose();
});

describe('POST /api/v1/auth/register', () => {
  it('registers a new user and returns 201 with user only (no password/hash)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: REGISTER_URL,
      payload: registerPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      user: {
        id: expect.any(String),
        email: REGISTER_EMAIL,
      },
    });

    // Password and hash must never appear in the response
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(TEST_PASSWORD);

    // Verify cookie
    const setCookie = res.headers['set-cookie'];

    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain(`Max-Age=${SESSION_LIFETIME_DAYS * 60 * 60 * 24}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    // Verify database
    const user = await findUserByEmail(testApp.db, REGISTER_EMAIL);
    expect(user).toBeDefined();

    const sessions = await findSessionsByUserId(testApp.db, user!.id);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBeDefined();
  });

  it('returns 403 for an invalid registration code', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: REGISTER_URL,
      payload: registerPayload({ inviteCode: 'wrong-code' }),
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(TEST_PASSWORD);
  });

  it('returns 400 for a malformed email address', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: REGISTER_URL,
      payload: registerPayload({ email: 'not-an-email' }),
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(TEST_PASSWORD);
  });

  it('returns 400 for a password below the minimum length', async () => {
    const shortPassword = 'short';
    const res = await testApp.app.inject({
      method: 'POST',
      url: REGISTER_URL,
      payload: registerPayload({ password: shortPassword }),
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    // The actual password value must never appear in the response
    expect(bodyText).not.toContain(shortPassword);
    expect(bodyText).not.toContain('hash');
  });

  it('returns 409 when the email is already registered', async () => {
    const email = 'duplicate@example.com';
    const passwordHash = await hashPassword(TEST_PASSWORD);

    // Pre-create a user in the database
    await createUser(testApp.db, { email, passwordHash });

    const res = await testApp.app.inject({
      method: 'POST',
      url: REGISTER_URL,
      payload: registerPayload({ email }),
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(passwordHash);
  });
});

describe('POST /api/v1/auth/login', () => {
  let userId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const result = await createUser(testApp.db, { email: LOGIN_EMAIL, passwordHash });

    if (!result.success) throw new Error('Failed to create test user');

    userId = result.user.id;
  });

  it('success: logs in a user with correct credentials', async () => {
    const sessionsBefore = await findSessionsByUserId(testApp.db, userId);
    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      user: {
        id: userId,
        email: LOGIN_EMAIL,
      },
    });

    // Verify cookie
    const setCookie = res.headers['set-cookie'];

    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain(`Max-Age=${SESSION_LIFETIME_DAYS * 60 * 60 * 24}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('password');
    expect(bodyText).not.toContain('hash');

    const sessionsAfter = await findSessionsByUserId(testApp.db, userId);
    expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);
  });

  it('invalid email: returns 400 for a malformed email address', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload({ email: 'not-an-email' }),
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('hash');
    expect(bodyText).not.toContain(TEST_PASSWORD);
  });

  it('returns 401 for an unknown email', async () => {
    const sessionsBefore = await findSessionsByUserId(testApp.db, userId);

    const email = 'unknown-email@example.com';

    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload({ email }),
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('hash');

    const sessionsAfter = await findSessionsByUserId(testApp.db, userId);
    expect(sessionsBefore.length).toBe(sessionsAfter.length);
  });

  it('returns 401 for an incorrect password', async () => {
    const sessionsBefore = await findSessionsByUserId(testApp.db, userId);

    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload({ password: 'incorrect-password' }),
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('hash');

    const sessionsAfter = await findSessionsByUserId(testApp.db, userId);
    expect(sessionsBefore.length).toBe(sessionsAfter.length);
  });

  it('unknown email is not dramatically faster than an incorrect password', async () => {
    const iterations = 6;
    const unknownEmail = 'unknown-email@example.com';
    const wrongPassword = 'incorrect-password';

    // Warm up JIT / argon2 before measuring.
    await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload({ email: unknownEmail }),
    });
    await testApp.app.inject({
      method: 'POST',
      url: LOGIN_URL,
      payload: loginPayload({ password: wrongPassword }),
    });

    const unknownMs: number[] = [];
    const incorrectMs: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const unknownStart = process.hrtime.bigint();
      await testApp.app.inject({
        method: 'POST',
        url: LOGIN_URL,
        payload: loginPayload({ email: unknownEmail }),
      });
      unknownMs.push(Number(process.hrtime.bigint() - unknownStart) / 1_000_000);

      const incorrectStart = process.hrtime.bigint();
      await testApp.app.inject({
        method: 'POST',
        url: LOGIN_URL,
        payload: loginPayload({ password: wrongPassword }),
      });
      incorrectMs.push(Number(process.hrtime.bigint() - incorrectStart) / 1_000_000);
    }

    const avgUnknown = unknownMs.reduce((total, ms) => total + ms, 0) / unknownMs.length;
    const avgIncorrect = incorrectMs.reduce((total, ms) => total + ms, 0) / incorrectMs.length;

    expect(avgUnknown).toBeGreaterThan(avgIncorrect * 0.5);
  });

  it('should set secure to true in production', async () => {
    const prodApp = await createTestApp({ env: { NODE_ENV: 'production' } });
    try {
      const passwordHash = await hashPassword(TEST_PASSWORD);
      const result = await createUser(prodApp.db, {
        email: LOGIN_EMAIL,
        passwordHash,
      });

      if (!result.success) throw new Error('Failed to create test user');

      const res = await prodApp.app.inject({
        method: 'POST',
        url: LOGIN_URL,
        payload: loginPayload(),
      });

      expect(res.statusCode).toBe(200);

      const setCookie = res.headers['set-cookie'];

      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Secure');
    } finally {
      await prodApp.dispose();
    }
  });
});

describe('POST /api/v1/auth/logout', () => {
  let userId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const result = await createUser(testApp.db, { email: LOGOUT_EMAIL, passwordHash });

    if (!result.success) throw new Error('Failed to create test user');

    userId = result.user.id;
  });

  it('should successfully log a user out', async () => {
    const token = 'logout-token';
    const tokenHash = hashToken(token);
    const session = await createSession(testApp.db, {
      userId,
      tokenHash,
      expiresAt: getSessionExpiry(new Date()),
    });
    if (!session) throw new Error('expected session creation to succeed');
    const sessionsBefore = await findSessionsByUserId(testApp.db, userId);
    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGOUT_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    // Verify session was deleted
    const sessionsAfter = await findSessionsByUserId(testApp.db, userId);
    expect(sessionsAfter.length).toBe(sessionsBefore.length - 1);

    // Verify cookie was cleared
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('should succeed quietly without a session', async () => {
    const token = 'there-is-no-session-with-this-token';
    const sessionsBefore = await findSessionCount(testApp.db);
    const res = await testApp.app.inject({
      method: 'POST',
      url: LOGOUT_URL,
      cookies: {
        [SESSION_COOKIE_NAME]: token,
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    // Verify no sessions were affected
    const sessionsAfter = await findSessionCount(testApp.db);
    expect(sessionsAfter).toBe(sessionsBefore);

    // Verify cookie was cleared
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });
});
