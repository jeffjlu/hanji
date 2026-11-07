import { type Database } from '../index.js';
import { appUser } from '../schema/auth.js';

type CreateTestUserOptions = {
  email?: string;
  passwordHash?: string;
};

// Create a test user with provided values, or dummy values if none are provided.
export async function createTestUser(db: Database, options: CreateTestUserOptions = {}) {
  const [user] = await db
    .insert(appUser)
    .values({
      email: options.email ?? `test-${crypto.randomUUID()}@example.com`,
      passwordHash: options.passwordHash ?? 'test-password-hash',
    })
    .returning();

  if (!user) throw new Error('Failed to create test user');

  return user;
}
