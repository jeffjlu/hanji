import { describe, expect, it } from 'vitest';
import {
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
  verifyPasswordWithDummyHash,
} from './password.js';

// Extract Argon2 parameters from an encoded hash.
// Format: $argon2id$v=19$m=<memory>,p=<parallelism>,t=<time>$<salt>$<hash>
function parseArgon2Params(hash: string): { m: number; p: number; t: number } {
  const segment = hash.split('$')[3];
  const params = Object.fromEntries(
    (segment ?? '').split(',').map((pair) => pair.split('=') as [string, string])
  );
  const m = Number(params['m']);
  const p = Number(params['p']);
  const t = Number(params['t']);
  if (![m, p, t].every(Number.isFinite)) {
    throw new Error('Could not parse Argon2 parameters from hash');
  }
  return { m, p, t };
}

// OWASP minimums for Argon2id, as recorded in password.ts.
const OWASP_MIN_MEMORY = 19_456;
const OWASP_MIN_TIME = 2;
const OWASP_MIN_PARALLELISM = 1;

describe('hashPassword', () => {
  it('returns a hash that starts with $argon2id$', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('uses Argon2 parameters at or above OWASP minimums', async () => {
    const hash = await hashPassword('test-password-123');
    const { m, p, t } = parseArgon2Params(hash);
    expect(m).toBeGreaterThanOrEqual(OWASP_MIN_MEMORY);
    expect(p).toBeGreaterThanOrEqual(OWASP_MIN_PARALLELISM);
    expect(t).toBeGreaterThanOrEqual(OWASP_MIN_TIME);
  });

  it('produces a different hash for the same password', async () => {
    const password = 'test-password-123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    await expect(verifyPassword(hash1, password)).resolves.toBe(true);
    await expect(verifyPassword(hash2, password)).resolves.toBe(true);

    expect(hash2).not.toBe(hash1);
  });

  it('round-trips a unicode password', async () => {
    const password = 'p\u00e4ssw\u00f6rd-\u65e5\u672c\u8a9e';
    const hash = await hashPassword(password);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });

  it('hashes an empty string (relies on schema length check)', async () => {
    const hash = await hashPassword('');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, '')).resolves.toBe(true);
  });

  it('hashes a 128-character password', async () => {
    const password = 'a'.repeat(128);
    const hash = await hashPassword(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('test-password-123');
    await expect(verifyPassword(hash, 'test-password-123')).resolves.toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const hash = await hashPassword('test-password-123');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('returns false for an empty string against a real hash', async () => {
    const hash = await hashPassword('test-password-123');
    await expect(verifyPassword(hash, '')).resolves.toBe(false);
  });
});

describe('verifyPasswordWithDummyHash', () => {
  it('returns false for any password and does not throw', async () => {
    await expect(verifyPasswordWithDummyHash('any-password')).resolves.toBe(false);
    await expect(verifyPasswordWithDummyHash('')).resolves.toBe(false);
  });

  it('has the same Argon2 parameters as a real hash (timing-attack resistance)', async () => {
    expect(DUMMY_HASH).toMatch(/^\$argon2id\$/);

    const realHash = await hashPassword('test-password-123');
    const dummyParams = parseArgon2Params(DUMMY_HASH);
    const realParams = parseArgon2Params(realHash);

    expect(dummyParams.m).toBe(realParams.m);
    expect(dummyParams.p).toBe(realParams.p);
    expect(dummyParams.t).toBe(realParams.t);

    expect(dummyParams.m).toBeGreaterThanOrEqual(OWASP_MIN_MEMORY);
    expect(dummyParams.p).toBeGreaterThanOrEqual(OWASP_MIN_PARALLELISM);
    expect(dummyParams.t).toBeGreaterThanOrEqual(OWASP_MIN_TIME);
  });
});
