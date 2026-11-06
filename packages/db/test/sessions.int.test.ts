import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  extendSession,
  findSessionByTokenHash,
} from '../src/queries/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../src/testing/db.js';
import { createTestUser } from '../src/testing/user.js';

let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
let db: typeof testDatabase.db;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.dispose();
});

describe('create session', () => {
  it('should create a valid session successfully', async () => {
    const user = await createTestUser(db);
    const input = {
      userId: user.id,
      tokenHash: 'token-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    const createdSession = await createSession(db, input);

    expect(createdSession).toMatchObject(input);
    expect(createdSession.id).toBeDefined();
    expect(createdSession.createdAt).toBeInstanceOf(Date);
  });

  it('should reject duplicate token hashes', async () => {
    const user = await createTestUser(db);
    const input = {
      userId: user.id,
      tokenHash: 'duplicate-token-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await createSession(db, input);

    await expect(createSession(db, input)).rejects.toMatchObject({
      cause: {
        code: '23505',
        constraint_name: 'session_token_hash_unique',
      },
    });
  });
});

describe('findSessionByTokenHash', () => {
  it('should return the session and user (id and email only) when the token hash exists', async () => {
    const user = await createTestUser(db);
    const tokenHash = 'hashed-token';
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const createdSession = await createSession(db, {
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const result = await findSessionByTokenHash(db, tokenHash);
    expect(result).toBeDefined();
    expect(result?.id).toBe(createdSession.id);
    expect(result?.userId).toBe(user.id);
    expect(result?.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(result?.user).toEqual({ id: user.id, email: user.email });

    // The token hash must never be leaked by the returned object.
    expect(result).not.toHaveProperty('tokenHash');
  });

  it('should return undefined when no session has the token hash', async () => {
    const result = await findSessionByTokenHash(db, 'unknown-token-hash');
    expect(result).toBeUndefined();
  });

  it('should return the session even when expired (no expiry filtering)', async () => {
    const user = await createTestUser(db);
    const tokenHash = 'expired-token-hash';
    const expiresAt = new Date(Date.now() - 1000);

    await createSession(db, {
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const result = await findSessionByTokenHash(db, tokenHash);
    expect(result).toBeDefined();
    expect(result?.expiresAt.getTime()).toBeLessThan(Date.now());
  });
});

describe('deleteExpiredSessions', () => {
  it('should delete expired sessions and keep non-expired ones', async () => {
    const user = await createTestUser(db);
    const expiredToken = 'expired-token';
    const validToken = 'valid-token';
    await createSession(db, {
      userId: user.id,
      tokenHash: expiredToken,
      expiresAt: new Date(Date.now() - 1000),
    });
    await createSession(db, {
      userId: user.id,
      tokenHash: validToken,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await deleteExpiredSessions(db, new Date());

    expect(await findSessionByTokenHash(db, expiredToken)).toBeUndefined();
    expect(await findSessionByTokenHash(db, validToken)).toBeDefined();
  });

  it('should delete nothing when no sessions are expired', async () => {
    const user = await createTestUser(db);
    const tokenHash = 'still-valid-token';
    await createSession(db, {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await deleteExpiredSessions(db, new Date());

    expect(await findSessionByTokenHash(db, tokenHash)).toBeDefined();
  });
});

describe('extendSession', () => {
  it('should extend the session expiresAt when the session exists', async () => {
    const user = await createTestUser(db);
    const originalExpiresAt = new Date(Date.now() + 1000 * 60);
    const createdSession = await createSession(db, {
      userId: user.id,
      tokenHash: 'token-to-extend',
      expiresAt: originalExpiresAt,
    });

    const newExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    const updated = await extendSession(db, createdSession.id, newExpiresAt);
    expect(updated).toBeDefined();
    expect(updated?.id).toBe(createdSession.id);
    expect(updated?.expiresAt.getTime()).toBe(newExpiresAt.getTime());

    const result = await findSessionByTokenHash(db, 'token-to-extend');
    expect(result?.expiresAt.getTime()).toBe(newExpiresAt.getTime());
  });

  it('should return undefined when the session does not exist', async () => {
    const updated = await extendSession(
      db,
      '00000000-0000-0000-0000-000000000000',
      new Date(Date.now() + 1000 * 60 * 60)
    );
    expect(updated).toBeUndefined();
  });
});

describe('deleteSession', () => {
  it('should delete the session when it exists', async () => {
    const user = await createTestUser(db);
    const createdSession = await createSession(db, {
      userId: user.id,
      tokenHash: 'token-to-delete',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const deleted = await deleteSession(db, createdSession.id);
    expect(deleted).toBeDefined();
    expect(deleted?.id).toBe(createdSession.id);

    const result = await findSessionByTokenHash(db, 'token-to-delete');
    expect(result).toBeUndefined();
  });

  it('should return undefined when the session does not exist', async () => {
    const deleted = await deleteSession(db, '00000000-0000-0000-0000-000000000000');
    expect(deleted).toBeUndefined();
  });
});
