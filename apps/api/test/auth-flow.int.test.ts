import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient } from './test-client.js';
import { createTestApp } from './app.js';

const REGISTRATION_CODE = 'test-invite-code';
const AUTH_PREFIX = '/api/v1/auth';
const LOGOUT_URL = `${AUTH_PREFIX}/logout`;
const ME_URL = '/api/v1/me';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'thisIsALongEnoughPassword';

describe('authentication flow', () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;
  let testClient: TestClient;

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { REGISTRATION_CODE },
    });
    testClient = new TestClient(testApp.app, testApp.config.WEB_ORIGIN);
  });

  afterAll(async () => {
    await testApp.dispose();
  });

  it('should register, access the current user, log out, and reject subsequent access', async () => {
    // 1. register user
    const registerRes = await testClient.registerAndLogin({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      inviteCode: REGISTRATION_CODE,
    });
    expect(registerRes.statusCode).toBe(201);

    // 2. access /me
    const meRes = await testClient.request({
      method: 'GET',
      url: ME_URL,
    });
    expect(meRes.statusCode).toBe(200);

    // 3. logout
    const logoutRes = await testClient.request({
      method: 'POST',
      url: LOGOUT_URL,
    });
    expect(logoutRes.statusCode).toBe(204);

    // 4. try to access /me again, verify old token no longer works
    const afterLogoutRes = await testClient.request({
      method: 'GET',
      url: ME_URL,
    });
    expect(afterLogoutRes.statusCode).toBe(401);
  });
});
