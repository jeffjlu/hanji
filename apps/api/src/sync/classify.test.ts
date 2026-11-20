import { describe, expect, it } from 'vitest';
import { localDay } from '@hanji/core';
import { type ReviewEventIn } from '@hanji/schemas';
import { classifyByOwner, partitionByCard, reject, toRows } from './classify.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const REVIEWED_AT = new Date('2026-01-10T09:00:00Z');
const RECEIVED_AT = new Date('2026-01-15T12:00:00Z');

const baseEvent: ReviewEventIn = {
  id: '0192705a-3b36-7b7a-8f3e-4f3b2c1d8e9a',
  cardId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  reviewedAt: '2026-01-15T12:00:00Z',
  tz: 'America/Los_Angeles',
  retention: 0.85,
  rating: 3,
  responseMs: 1200,
  correct: true,
  hintUsed: false,
};

function makeEvent(overrides: Partial<ReviewEventIn>): ReviewEventIn {
  return { ...baseEvent, ...overrides } as ReviewEventIn;
}

describe('classifyByOwner', () => {
  it('classifies events as own, foreign, or new', () => {
    const own = baseEvent;
    const foreign = makeEvent({ id: '0192705a-3b36-7e7a-8f3e-4f3b2c1d8e9a' });
    const fresh = makeEvent({ id: '0192705a-3b36-7f7a-8f3e-4f3b2c1d8e9a' });
    const events = [own, foreign, fresh].map((event) => ({ event, at: REVIEWED_AT }));
    const ownersById = new Map([
      [own.id, USER_ID],
      [foreign.id, OTHER_USER_ID],
    ]);
    const {
      duplicates,
      foreign: rejected,
      fresh: kept,
    } = classifyByOwner(events, ownersById, USER_ID);

    expect(duplicates).toEqual([own.id]);
    expect(rejected).toEqual([reject(foreign.id, 'invalid')]);
    expect(kept).toEqual([fresh]);
  });
});

describe('partitionByCard', () => {
  it('splits fresh events into known cards and unknown cards', () => {
    const knownCardId = baseEvent.cardId;
    const unknown = makeEvent({
      id: '0192705a-3b36-707a-8f3e-4f3b2c1d8e9a',
      cardId: 'c47ac10b-58cc-4372-a567-0e02b2c3d479',
    });
    const knownCardIds = new Set([knownCardId]);

    const { known, unknownCard } = partitionByCard([baseEvent, unknown], knownCardIds);

    expect(known).toEqual([baseEvent]);
    expect(unknownCard).toEqual([reject(unknown.id, 'unknown_card')]);
  });
});

describe('toRows', () => {
  const ctx = {
    userId: USER_ID,
    deviceId: 'd81d4fae-7dec-41d0-a765-00a0c91e6bf6',
    firstSeq: 10,
    receivedAt: RECEIVED_AT,
  };

  it('assigns consecutive userSeq starting at firstSeq', () => {
    const events = [
      baseEvent,
      makeEvent({ id: '0192705a-3b36-7e7a-8f3e-4f3b2c1d8e9a' }),
      makeEvent({ id: '0192705a-3b36-7f7a-8f3e-4f3b2c1d8e9a' }),
    ];
    const rows = toRows(events, ctx);

    expect(rows.map((row) => row.userSeq)).toEqual([10, 11, 12]);
    expect(rows.map((row) => row.userId)).toEqual([USER_ID, USER_ID, USER_ID]);
    expect(rows.map((row) => row.deviceId)).toEqual([ctx.deviceId, ctx.deviceId, ctx.deviceId]);
    expect(rows.map((row) => row.receivedAt)).toEqual([RECEIVED_AT, RECEIVED_AT, RECEIVED_AT]);
  });

  it('computes localDay correctly near local midnight', () => {
    // 07:59:59Z is still 2026-03-07 in America/Los_Angeles (PST, UTC-8).
    const beforeMidnight = makeEvent({
      id: '0192705a-3b36-707a-8f3e-4f3b2c1d8e9a',
      reviewedAt: '2026-03-08T07:59:59Z',
    });
    // 08:00:00Z is midnight local, the start of 2026-03-08.
    const afterMidnight = makeEvent({
      id: '0192705a-3b36-717a-8f3e-4f3b2c1d8e9a',
      reviewedAt: '2026-03-08T08:00:00Z',
    });
    const rows = toRows([beforeMidnight, afterMidnight], ctx);

    expect(rows[0]!.localDay).toBe('2026-03-07');
    expect(rows[1]!.localDay).toBe('2026-03-08');
    // Sanity check: the same instants are both on 2026-03-08 in UTC.
    expect(localDay(new Date('2026-03-08T07:59:59Z'), 'UTC')).toBe('2026-03-08');
    expect(localDay(new Date('2026-03-08T08:00:00Z'), 'UTC')).toBe('2026-03-08');
  });

  it('returns [] for empty input', () => {
    expect(toRows([], ctx)).toEqual([]);
  });
});
