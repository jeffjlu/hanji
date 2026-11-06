import { createUser, findUserByEmail, findUserById } from '../src/queries/index.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, resetTables } from '../src/testing/index.js';
import { hashPassword } from '../../../apps/api/src/auth/password.js';

let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
let db: typeof testDatabase.db;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  db = testDatabase.db;
});

afterEach(async () => {
  await resetTables(testDatabase.sql);
});

afterAll(async () => {
  await testDatabase.dispose();
});

describe('createUser', () => {
  it('should create a user with valid email and password', async () => {
    const email = 'test-email@example.com';
    const passwordHash = await hashPassword('thisIsAValidPassword');

    const result = await createUser(db, { email, passwordHash });
    if (!result.success) throw new Error('Expected user creation to succeed');

    const user = result.user;
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBe(passwordHash);
  });

  it('should handle a duplicate email error', async () => {
    const email = 'test-email@example.com';
    const passwordHash = await hashPassword('thisIsAValidPassword');

    const firstResult = await createUser(db, {
      email,
      passwordHash,
    });
    const secondResult = await createUser(db, {
      email,
      passwordHash,
    });

    expect(firstResult.success).toBe(true);
    expect(secondResult).toEqual({
      success: false,
      reason: 'duplicate_email',
    });
  });

  it('should reject an email that is not lowercase', async () => {
    const email = 'ThisEmailHasUpperCaseLetters@example.com';
    const passwordHash = await hashPassword('thisIsAValidPassword');

    await expect(
      createUser(testDatabase.db, {
        email,
        passwordHash,
      })
    ).rejects.toMatchObject({
      cause: {
        code: '23514',
        constraint_name: 'app_user_email_lowercase',
      },
    });
  });
});

describe('findUserByEmail', () => {
  it('should return undefined when no user has the email', async () => {
    const user = await findUserByEmail(db, 'no-user-has-this-email@example.com');
    expect(user).toBeUndefined();
  });

  it('should return the user when the email exists', async () => {
    const email = 'find-user-by-email@example.com';
    const passwordHash = await hashPassword('thisIsAValidPassword');

    const createResult = await createUser(db, { email, passwordHash });
    if (!createResult.success) throw new Error('Expected user creation to succeed');

    const user = await findUserByEmail(db, email);
    expect(user).toBeDefined();
    expect(user?.id).toBe(createResult.user.id);
    expect(user?.email).toBe(email);
    expect(user?.passwordHash).toBe(passwordHash);
  });
});

describe('findUserById', () => {
  it('should return undefined when no user has the id', async () => {
    const user = await findUserById(db, '00000000-0000-0000-0000-000000000000');
    expect(user).toBeUndefined();
  });

  it('should return the user when the id exists', async () => {
    const email = 'find-user-by-id@example.com';
    const passwordHash = await hashPassword('thisIsAValidPassword');

    const createResult = await createUser(db, { email, passwordHash });
    if (!createResult.success) throw new Error('Expected user creation to succeed');

    const user = await findUserById(db, createResult.user.id);
    expect(user).toBeDefined();
    expect(user?.id).toBe(createResult.user.id);
    expect(user?.email).toBe(email);
  });
});
