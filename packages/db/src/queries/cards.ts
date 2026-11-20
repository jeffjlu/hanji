import { inArray } from 'drizzle-orm';
import { card } from '../schema/content.js';
import { type Executor } from './executor.js';

export async function findExistingCardIds(executor: Executor, cardIds: string[]) {
  return cardIds.length
    ? await executor.select({ id: card.id }).from(card).where(inArray(card.id, cardIds))
    : [];
}
