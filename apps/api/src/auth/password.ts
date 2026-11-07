import argon2 from 'argon2';

// Minimum recommended parameters for Argon2id hashing, based on OWASP recommendations.
// As of November 5, 2026
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Hashes a password using Argon2id.
export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, ARGON2_OPTIONS);
}

// Verifies a password against a hash using Argon2id.
// Returns false (never throws) for malformed or corrupted hashes so a bad row
// in the database cannot turn a login attempt into a 500.
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$g+XbcPxQN8kE86BKph+UIg$UF1fVI3YnYJi8xk/jBbdIA0mBhb7NJ8d/D4LlwiKqJ4';

// Verifies a password against a dummy hash using Argon2id to prevent timing attacks.
export async function verifyPasswordWithDummyHash(password: string): Promise<boolean> {
  return await argon2.verify(DUMMY_HASH, password);
}
