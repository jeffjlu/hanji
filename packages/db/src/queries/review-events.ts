// packages/db/src/testing/queries.ts
import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { reviewEvent } from '../schema/index.js';

export async function findStoredEvents(db: Database, userId: string) {
  return db
    .select()
    .from(reviewEvent)
    .where(eq(reviewEvent.userId, userId))
    .orderBy(reviewEvent.userSeq);
}