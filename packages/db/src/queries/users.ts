import { type Executor } from './executor.js';
import { appUser, type User } from '../schema/index.js';
import { eq } from 'drizzle-orm';

export type CreateUserInput = {
  email: string;
  passwordHash: string;
};

export type CreateUserResult =
  { success: true; user: User } | { success: false; reason: 'duplicate_email' };

/**
 * Creates a user with the supplied email and password hash.
 *
 * Returns a duplicate-email result if another user already uses
 * the email. Other database errors are propagated.
 *
 * @param executor Database connection or transaction to execute against.
 * @param input User email and precomputed password hash.
 */
export async function createUser(
  executor: Executor,
  input: CreateUserInput
): Promise<CreateUserResult> {
  const [user] = await executor
    .insert(appUser)
    .values(input)
    .onConflictDoNothing({ target: appUser.email })
    .returning();

  if (!user) {
    return { success: false, reason: 'duplicate_email' };
  }

  return { success: true, user };
}

/**
 * Returns a user with the given email, or undefined if no user is found with email.
 */
export async function findUserByEmail(
  executor: Executor,
  email: string
): Promise<User | undefined> {
  const [user] = await executor.select().from(appUser).where(eq(appUser.email, email)).limit(1);

  return user;
}

/**
 * Returns a user with the given id, or undefined if no user is found with id.
 */
export async function findUserById(executor: Executor, id: string): Promise<User | undefined> {
  const [user] = await executor.select().from(appUser).where(eq(appUser.id, id)).limit(1);

  return user;
}
