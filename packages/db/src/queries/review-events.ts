import { eq, inArray } from 'drizzle-orm';
import { type NewReviewEvent, reviewEvent } from '../schema/sync.js';
import { type Executor } from './executor.js';

export async function findStoredEventsByUserId(executor: Executor, userId: string) {
  return userId.length
    ? executor
        .select()
        .from(reviewEvent)
        .where(eq(reviewEvent.userId, userId))
        .orderBy(reviewEvent.userSeq)
    : [];
}

/**
 * Returns events and user id of events with given ids.
 */
export async function findStoredEventsById(executor: Executor, eventIds: string[]) {
  return eventIds.length
    ? executor
        .select({ id: reviewEvent.id, userId: reviewEvent.userId })
        .from(reviewEvent)
        .where(inArray(reviewEvent.id, eventIds))
    : [];
}

export async function insertReviewEvents(executor: Executor, events: NewReviewEvent[]) {
  return executor.insert(reviewEvent).values(events);
}
