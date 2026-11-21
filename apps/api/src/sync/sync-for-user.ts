import { findCardEvents, findUserCardStatesSince, upsertUserCard, type Executor } from '@hanji/db';
import { type ReviewEventIn, type UserCardState } from '@hanji/schemas';
import { ingestEvents, type IngestInput, type IngestOutcome } from './ingest.js';
import { replayCard } from '@hanji/core';
import { toReviewEventIn, toUserCardRow, toUserCardState } from './mappers.js';

export type SyncInput = IngestInput & { sinceSeq: number };
export type SyncOutcome = IngestOutcome & { cardStates: UserCardState[] };

export async function syncForUser(tx: Executor, now: Date, input: SyncInput): Promise<SyncOutcome> {
  const ingest = await ingestEvents(tx, now, input);

  for (const cardId of ingest.affectedCardIds) {
    const dbEvents = await findCardEvents(tx, input.userId, cardId);
    const events: ReviewEventIn[] = dbEvents.map(toReviewEventIn);
    const state = await replayCard(events);
    if (state === null) continue;
    const lastSeq = Math.max(...dbEvents.map((e) => e.userSeq));
    const row = toUserCardRow(input.userId, state, lastSeq);
    await upsertUserCard(tx, row);
  }
  const dbCardStates = await findUserCardStatesSince(tx, input.userId, input.sinceSeq);
  const cardStates = dbCardStates.map(toUserCardState);
  return { ...ingest, cardStates };
}
