import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app.js';
import { hashPassword } from '../auth/password.js';
import { createUser, findUserByEmail } from '@hanji/db';
import { SESSION_COOKIE_NAME, SESSION_LIFETIME_DAYS } from '../auth/session.js';
import { findSessionsByUserId } from '@hanji/db/testing';

const REGISTRATION_CODE = 'test-invite-code';
const REGISTER_URL = '/api/v1/register';
const TEST_EMAIL = 'newuser@example.com';
const TEST_PASSWORD = 'thisIsALongEnoughPassword';

function registerPayload(
  overrides: Partial<{ email: string; password: string; inviteCode: string }> = {}
) {
  return {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    inviteCode: REGISTRATION_CODE,
    ...overrides,
  };
}

describe('POST /api/v1/register', () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { REGISTRATION_CODE },
    });
  });

  afterAll(async () => {
    await testApp.dispose();
  });

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
        email: TEST_EMAIL,
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
    expect(setCookie).toContain(`Max-Age=${SESSION_LIFETIME_DAYS * 60 * 60 * 24 * 1000}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    // Verify database
    const user = await findUserByEmail(testApp.db, TEST_EMAIL);
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
