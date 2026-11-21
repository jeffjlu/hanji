import { and, eq, gt } from 'drizzle-orm';
import { userCard, type NewUserCard } from '../schema/sync.js';
import { type Executor } from './executor.js';

export async function upsertUserCard(executor: Executor, row: NewUserCard) {
  const { userId: _userId, cardId: _cardId, ...withoutIds } = row;
  return executor
    .insert(userCard)
    .values(row)
    .onConflictDoUpdate({
      target: [userCard.userId, userCard.cardId],
      set: withoutIds,
    })
    .returning();
}

/**
 * Returns user cards with a last_seq greater than sinceSeq, ordered by last_seq.
 */
export async function findUserCardStatesSince(
  executor: Executor,
  userId: string,
  sinceSeq: number
) {
  return executor
    .select()
    .from(userCard)
    .where(and(eq(userCard.userId, userId), gt(userCard.lastSeq, sinceSeq)))
    .orderBy(userCard.lastSeq);
}
