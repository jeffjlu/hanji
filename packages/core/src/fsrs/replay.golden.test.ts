import { describe, it, expect, vi } from 'vitest';
import { type ReviewEventIn, reviewEventInSchema } from '@hanji/schemas';
import { replayCard, dedupeAndSort } from './replay.js';
import { applyReview } from './apply-review.js';
import { buildSchedulers } from './scheduler.js';
import { type CardState } from './card-state.js';
import { goldenEvents } from './fixtures/golden-events.js';
import expected from './fixtures/golden-expected.json' with { type: 'json' };
import fc from 'fast-check';

const events: ReviewEventIn[] = goldenEvents;

describe('replayCard golden fixture', () => {
  it('has only schema-valid events', () => {
    for (const event of events) {
      expect(reviewEventInSchema.safeParse(event).success, event.id).toBe(true);
    }
  });

  it('replays the golden event sequence to the expected final state', async () => {
    const before = structuredClone(events);
    const final = await replayCard(events);
    expect(events).toEqual(before); // input must not be mutated
    expect(final).toEqual(expected.final);
  });

  it('is order-independent: seeded shuffle + duplicates yields the same state', async () => {
    const shuffledEventsArb = fc.shuffledSubarray(events, {
      minLength: events.length,
      maxLength: events.length,
    });

    await fc.assert(
      fc.asyncProperty(shuffledEventsArb, async (shuffled) => {
        const withDuplicates = [...shuffled, ...events.slice(0, 5)];
        const final = await replayCard(withDuplicates);
        expect(final).toEqual(expected.final);
      }),
      { seed: 42 }
    );
  });

  it('matches the expected state after every step', async () => {
    const sorted = dedupeAndSort(events);
    expect(expected.steps).toHaveLength(sorted.length); // self-checking pair
    const schedulerLookup = await buildSchedulers(sorted.map((event) => event.retention));
    let state: CardState | null = null;
    for (const [index, event] of sorted.entries()) {
      state = applyReview(state, event, schedulerLookup);
      expect(state, `diverged at event ${index} (${event.id})`).toEqual(expected.steps[index]);
    }
    expect(state).toEqual(expected.final);
  });

  it('is independent of the system clock', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
      const a = await replayCard(events);
      vi.setSystemTime(new Date('2040-06-15T12:00:00Z'));
      const b = await replayCard(events);
      expect(a).toEqual(expected.final);
      expect(b).toEqual(expected.final);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is independent of the event time zone (same instants, all UTC)', async () => {
    const allUtc = events.map((event) => ({ ...event, tz: 'UTC' as const }));
    const final = await replayCard(allUtc);
    expect(final).toEqual(expected.final);
  });
});
