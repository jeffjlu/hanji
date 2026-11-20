import { localDay } from '@hanji/core';
import { type NewReviewEvent } from '@hanji/db';
import { type Rejected, type ReviewEventIn } from '@hanji/schemas';
import { type ValidatedEvent } from './validate-events.js';

export type RejectReason = Rejected[number]['reason'];
export const reject = (id: string, reason: RejectReason): Rejected[number] => ({ id, reason });

export function partition<T>(items: readonly T[], keep: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [],
    no: T[] = [];
  for (const item of items) (keep(item) ? yes : no).push(item);
  return [yes, no];
}

/** Splits events by who already holds their id. */
export function classifyByOwner(
  events: readonly ValidatedEvent[],
  ownersById: ReadonlyMap<string, string>,
  userId: string
) {
  const duplicates: string[] = []; // held by this user: accepted, not re-inserted
  const foreign: Rejected = []; // held by another user: invalid
  const fresh: ReviewEventIn[] = [];
  for (const e of events) {
    const owner = ownersById.get(e.event.id);
    if (owner === undefined) fresh.push(e.event);
    else if (owner === userId) duplicates.push(e.event.id);
    else foreign.push(reject(e.event.id, 'invalid'));
  }
  return { duplicates, foreign, fresh };
}

export function partitionByCard(fresh: ReviewEventIn[], knownCardIds: ReadonlySet<string>) {
  const [known, unknown] = partition(fresh, (e) => knownCardIds.has(e.cardId));
  return { known, unknownCard: unknown.map((e) => reject(e.id, 'unknown_card')) };
}

/** Explicit column list, so a new schema field can't reach the insert by accident. */
export function toRows(
  events: ReviewEventIn[],
  ctx: { userId: string; deviceId: string; firstSeq: number; receivedAt: Date }
): NewReviewEvent[] {
  return events.map((e, i) => ({
    id: e.id,
    userId: ctx.userId,
    cardId: e.cardId,
    deviceId: ctx.deviceId,
    reviewedAt: new Date(e.reviewedAt),
    tz: e.tz,
    retention: e.retention,
    rating: e.rating,
    responseMs: e.responseMs,
    correct: e.correct,
    hintUsed: e.hintUsed,
    userSeq: ctx.firstSeq + i,
    localDay: localDay(new Date(e.reviewedAt), e.tz),
    receivedAt: ctx.receivedAt,
  }));
}
