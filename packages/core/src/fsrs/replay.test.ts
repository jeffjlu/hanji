import { describe, it, expect } from 'vitest';
import { type ReviewEventIn } from '@hanji/schemas';
import { dedupeAndSort, replayCard } from './replay.js';

const baseEvent: ReviewEventIn = {
  id: '017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f9000',
  cardId: 'c4a1b2d3-3e5f-4a6b-8c7d-0e1f2a3b4c5d',
  reviewedAt: '2026-01-05T08:00:00.000Z',
  tz: 'UTC',
  retention: 0.9,
  rating: 3,
  responseMs: 5000,
  correct: true,
  hintUsed: false,
};

function makeEvent(overrides: Partial<ReviewEventIn>): ReviewEventIn {
  return { ...baseEvent, ...overrides };
}

describe('replayCard', () => {
  it('throws when events have different cardIds', async () => {
    const events = [baseEvent, makeEvent({ id: 'anotherId', cardId: 'differentCardId' })];
    await expect(replayCard(events)).rejects.toThrow(
      /replayCard received events for more than one card/
    );
  });

  it('returns null for an empty input', async () => {
    expect(await replayCard([])).toBeNull();
  });
});

describe('dedupeAndSort', () => {
  it('sorts by instant, not by reviewedAt string', () => {
    // 6a: "2026-03-01T23:00:00.000-08:00" = 2026-03-02T07:00:00Z
    // 6b: "2026-03-02T00:00:00.000Z"      = 2026-03-02T00:00:00Z
    // As strings, 6a < 6b; by instant, 6b < 6a.
    const events = [
      makeEvent({ id: '...6a', reviewedAt: '2026-03-01T23:00:00.000-08:00', rating: 1 }),
      makeEvent({ id: '...6b', reviewedAt: '2026-03-02T00:00:00.000Z', rating: 3 }),
    ];
    const sorted = dedupeAndSort(events);
    expect(sorted[0]!.id).toBe('...6b'); // instant 00:00Z sorts before 07:00Z
    expect(sorted[1]!.id).toBe('...6a'); // instant 07:00Z sorts after 00:00Z
  });

  it('orders same-instant events by id', () => {
    const events = [
      makeEvent({ id: 'b', reviewedAt: '2026-01-05T08:00:00.000Z' }),
      makeEvent({ id: 'a', reviewedAt: '2026-01-05T08:00:00.000Z' }),
      makeEvent({ id: 'c', reviewedAt: '2026-01-05T08:00:00.000Z' }),
    ];
    const sorted = dedupeAndSort(events);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates by id, keeping the first occurrence (identical duplicates)', () => {
    const dup = makeEvent({ id: 'dup', reviewedAt: '2026-01-05T08:00:00.000Z', rating: 3 });
    const events = [dup, dup];
    const sorted = dedupeAndSort(events);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.rating).toBe(3);
  });

  it('throws on conflicting events sharing an id', () => {
    const events = [
      makeEvent({ id: 'dup', reviewedAt: '2026-01-05T08:00:00.000Z', rating: 3 }),
      makeEvent({ id: 'dup', reviewedAt: '2026-01-05T08:00:00.000Z', rating: 4 }),
    ];
    expect(() => dedupeAndSort(events)).toThrow(/Conflicting events share id/);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeAndSort([])).toEqual([]);
  });
});
