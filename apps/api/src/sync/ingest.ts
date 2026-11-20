import {
  findExistingCardIds,
  findStoredEventsById,
  insertReviewEvents,
  lockUserById,
  setLastSeq,
  type Executor,
} from '@hanji/db';
import { type Rejected } from '@hanji/schemas';
import { classifyByOwner, partitionByCard, toRows } from './classify.js';
import { type ValidatedEvent } from './validate-events.js';

export type IngestInput = { userId: string; deviceId: string; events: ValidatedEvent[] };

/** Internal result. The route builds the wire response from this. */
export type IngestOutcome = {
  accepted: string[];
  rejected: Rejected;
  serverSeq: number;
  affectedCardIds: string[];
};

export async function ingestEvents(
  tx: Executor,
  now: Date,
  input: IngestInput
): Promise<IngestOutcome> {
  const user = await lockUserById(tx, input.userId);

  const stored = await findStoredEventsById(
    tx,
    input.events.map((e) => e.event.id)
  );
  const ownersById = new Map(stored.map((r) => [r.id, r.userId]));
  const { duplicates, foreign, fresh } = classifyByOwner(input.events, ownersById, input.userId);

  const knownCards = new Set(
    (await findExistingCardIds(tx, [...new Set(fresh.map((e) => e.cardId))])).map((r) => r.id)
  );
  const { known, unknownCard } = partitionByCard(fresh, knownCards);

  const rows = toRows(known, {
    userId: input.userId,
    deviceId: input.deviceId,
    firstSeq: user.lastSeq + 1,
    receivedAt: now,
  });
  if (rows.length > 0) {
    await insertReviewEvents(tx, rows);
    await setLastSeq(tx, input.userId, user.lastSeq + rows.length);
  }

  return {
    accepted: [...duplicates, ...rows.map((r) => r.id)],
    rejected: [...foreign, ...unknownCard],
    serverSeq: user.lastSeq + rows.length,
    affectedCardIds: [...new Set(rows.map((r) => r.cardId))],
  };
}
