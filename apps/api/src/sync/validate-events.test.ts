import { describe, expect, it } from 'vitest';
import { type Deps } from '../deps.js';
import { validateEvents } from './validate-events.js';
import { type ReviewEventIn, type SyncEnvelope, MAX_FUTURE_SKEW } from '@hanji/schemas';

const NOW = new Date('2026-01-15T12:00:00Z');
const DEVICE_ID = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';

const baseEvent: ReviewEventIn = {
  id: '0192705a-3b36-7b7a-8f3e-4f3b2c1d8e9a',
  cardId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  reviewedAt: '2026-01-15T12:00:00Z',
  tz: 'America/New_York',
  retention: 0.85,
  rating: 3,
  responseMs: 1200,
  correct: true,
  hintUsed: false,
};

function makeEvent(overrides: Partial<ReviewEventIn>): ReviewEventIn {
  return { ...baseEvent, ...overrides } as ReviewEventIn;
}

const deps = { now: () => NOW } as Deps;

function envelope(events: ReviewEventIn[]): SyncEnvelope {
  return { deviceId: DEVICE_ID, sinceSeq: 0, events };
}

describe('validateEvents', () => {
  it('rejects a malformed event without failing the rest of the batch', () => {
    const bad = makeEvent({ tz: 'Mars/Olympus' });
    const good = makeEvent({ id: '0192705a-3b36-7c7a-8f3e-4f3b2c1d8e9a' });
    const { rejected, valid } = validateEvents(envelope([bad, good]), deps.now());
    expect(rejected).toEqual([{ id: bad.id, reason: 'invalid' }]);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.event.id).toBe(good.id);
  });

  it('processes duplicate ids only once', () => {
    const dup = makeEvent({ id: '0192705a-3b36-7d7a-8f3e-4f3b2c1d8e9a' });
    const { rejected, valid } = validateEvents(envelope([dup, dup]), deps.now());
    expect(rejected).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.event.id).toBe(dup.id);
  });

  it('accepts reviewedAt exactly now + MAX_FUTURE_SKEW and rejects 1 ms past it', () => {
    const atLimit = new Date(NOW.getTime() + MAX_FUTURE_SKEW).toISOString();
    const oneMsPast = new Date(NOW.getTime() + MAX_FUTURE_SKEW + 1).toISOString();

    const accepted = validateEvents(
      envelope([makeEvent({ id: '0192705a-3b36-7e7a-8f3e-4f3b2c1d8e9a', reviewedAt: atLimit })]),
      deps.now()
    );
    expect(accepted.rejected).toEqual([]);
    expect(accepted.valid).toHaveLength(1);

    const late = validateEvents(
      envelope([makeEvent({ id: '0192705a-3b36-7f7a-8f3e-4f3b2c1d8e9a', reviewedAt: oneMsPast })]),
      deps.now()
    );
    expect(late.valid).toEqual([]);
    expect(late.rejected).toEqual([
      { id: '0192705a-3b36-7f7a-8f3e-4f3b2c1d8e9a', reason: 'future' },
    ]);
  });

  it('accepts a two-year-old event', () => {
    const old = makeEvent({
      id: '0192705a-3b36-707a-8f3e-4f3b2c1d8e9a',
      reviewedAt: '2024-01-15T12:00:00Z',
    });
    const { rejected, valid } = validateEvents(envelope([old]), deps.now());
    expect(rejected).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.event.reviewedAt).toBe('2024-01-15T12:00:00Z');
  });

  it.each([
    { name: 'unknown time zone', overrides: { tz: 'Mars/Olympus' } },
    { name: 'again with correct=true', overrides: { rating: 1, correct: true } },
    { name: 'good with correct=false', overrides: { rating: 3, correct: false } },
  ] satisfies { name: string; overrides: Partial<ReviewEventIn> }[])(
    'rejects $name',
    ({ overrides }) => {
      const event = makeEvent({ id: '0192705a-3b36-717a-8f3e-4f3b2c1d8e9a', ...overrides });
      const { rejected, valid } = validateEvents(envelope([event]), deps.now());
      expect(rejected).toEqual([{ id: event.id, reason: 'invalid' }]);
      expect(valid).toEqual([]);
    }
  );
});
