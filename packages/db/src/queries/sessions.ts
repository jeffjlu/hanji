import { type Executor } from './executor.js';
import { appUser, session, type Session, type User } from '../schema/index.js';
import { eq, lt } from 'drizzle-orm';

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

/**
 * A session looked up by token hash, joined with its user but exposing only
 * the user's id and email. The token hash is deliberately excluded so the
 * authentication hook can never leak it by accident.
 */
export type SessionWithUser = {
  id: Session['id'];
  userId: Session['userId'];
  createdAt: Session['createdAt'];
  expiresAt: Session['expiresAt'];
  user: Pick<User, 'id' | 'email'>;
};

/**
 * Creates a session with the supplied user id and token hash.
 *
 * Throws an error if a session already exists with the given token hash.
 *
 * @param executor Database connection or transaction to execute against.
 * @param input User id and precomputed token hash.
 */
export async function createSession(
  executor: Executor,
  input: CreateSessionInput
): Promise<Session> {
  const [createdSession] = await executor.insert(session).values(input).returning();

  if (!createdSession) throw new Error('Session could not be created');
  return createdSession;
}

/**
 * Returns a session with the given token hash, joined with its user (id and
 * email only), or undefined if no session is found with token hash.
 *
 * Expiry is intentionally not filtered here: the session is returned with its
 * expiresAt so pure functions can decide whether it is expired or due for
 * extension. Lookups are by token hash because the cookie carries a token
 * that is hashed before comparison.
 */
export async function findSessionByTokenHash(
  executor: Executor,
  tokenHash: string
): Promise<SessionWithUser | undefined> {
  const [result] = await executor
    .select({
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      user: {
        id: appUser.id,
        email: appUser.email,
      },
    })
    .from(session)
    .innerJoin(appUser, eq(session.userId, appUser.id))
    .where(eq(session.tokenHash, tokenHash))
    .limit(1);

  return result;
}

/**
 * Extends a session by id, setting its expiresAt to the supplied value.
 * Returns the updated session, or undefined if no session exists with the id.
 *
 * The clock is passed in by the caller; queries never call `new Date()`
 * themselves so tests can control time.
 */
export async function extendSession(
  executor: Executor,
  id: string,
  newExpiresAt: Date
): Promise<Session | undefined> {
  const [updated] = await executor
    .update(session)
    .set({ expiresAt: newExpiresAt })
    .where(eq(session.id, id))
    .returning();

  return updated;
}

/**
 * Deletes the session with the given id.
 * Returns the deleted session, or undefined if no session exists with the id.
 */
export async function deleteSession(executor: Executor, id: string): Promise<Session | undefined> {
  const [deleted] = await executor.delete(session).where(eq(session.id, id)).returning();

  return deleted;
}

/**
 * Deletes all sessions whose expiresAt is before `now`. Cleanup is handled
 * separately from lookup; call this when it matters (e.g. on a schedule).
 *
 * The clock is passed in by the caller; queries never call `new Date()`
 * themselves so tests can control time.
 */
export async function deleteExpiredSessions(executor: Executor, now: Date): Promise<void> {
  await executor.delete(session).where(lt(session.expiresAt, now));
}
