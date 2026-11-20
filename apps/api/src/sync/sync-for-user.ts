import { type Executor } from '@hanji/db';
import { type UserCardState } from '@hanji/schemas';
import { ingestEvents, type IngestInput, type IngestOutcome } from './ingest.js';

export type SyncInput = IngestInput & { sinceSeq: number };
export type SyncOutcome = IngestOutcome & { cardStates: UserCardState[] };

export async function syncForUser(tx: Executor, now: Date, input: SyncInput): Promise<SyncOutcome> {
  const ingest = await ingestEvents(tx, now, input);

  // P1-05: replay ingest.affectedCardIds with core's replayCard, upsert user_card,
  // then select user_card rows with last_seq > input.sinceSeq for this user.
  return { ...ingest, cardStates: [] };
}
