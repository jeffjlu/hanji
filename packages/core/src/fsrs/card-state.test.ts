import { describe, it, expect } from 'vitest';
import { State } from 'ts-fsrs';
import { type CardState, toFsrsCard, fromFsrsCard } from './card-state.js';
import { type FsrsCard } from './scheduler.js';

const CARD_ID = '9c6be017-63a3-4354-8e3f-ce287f5f2392';
const DUE = '2026-03-04T05:06:07.000Z';
const LAST_REVIEW = '2026-02-01T08:09:10.000Z';
const FIRST_REVIEW = '2026-01-02T11:12:13.000Z';

const baseState: CardState = {
  cardId: CARD_ID,
  state: 'Review',
  due: DUE,
  stability: 2.5,
  difficulty: 6.25,
  reps: 7,
  lapses: 2,
  lastReview: LAST_REVIEW,
  correctReps: 5,
  firstReview: FIRST_REVIEW,
  scheduledDays: 9,
  learningStep: 3,
};

const states = [
  { name: 'New', state: State.New, status: 'new' },
  { name: 'Learning', state: State.Learning, status: 'learning' },
  { name: 'Review', state: State.Review, status: 'review' },
  { name: 'Relearning', state: State.Relearning, status: 'learning' },
] as const;

describe('toFsrsCard', () => {
  it.each(states)('maps $name to the library card', ({ name, state, status }) => {
    expect(toFsrsCard({ ...baseState, state: name })).toEqual({
      cardId: CARD_ID,
      stability: 2.5,
      difficulty: 6.25,
      reps: 7,
      lapses: 2,
      scheduledDays: 9,
      learningStep: 3,
      dueAt: new Date(DUE),
      lastReviewAt: new Date(LAST_REVIEW),
      state,
      scheduleStatus: status,
    });
  });
});

describe('fromFsrsCard', () => {
  it('takes derived values from the argument, not the card', () => {
    const result = fromFsrsCard(toFsrsCard(baseState), {
      correctReps: 9,
      firstReview: '2025-12-31T00:00:00.000Z',
    });
    expect(result.correctReps).toBe(9);
    expect(result.firstReview).toBe('2025-12-31T00:00:00.000Z');
  });

  it('rejects an fsrsCard with a null lastReviewAt', () => {
    const fsrsCard: FsrsCard = {
      cardId: CARD_ID,
      stability: 2.5,
      difficulty: 6.25,
      reps: 7,
      lapses: 2,
      scheduledDays: 9,
      learningStep: 3,
      dueAt: new Date(DUE),
      lastReviewAt: null,
      state: State.New,
      scheduleStatus: 'new' as const,
    };
    expect(() =>
      fromFsrsCard(fsrsCard, {
        correctReps: 1,
        firstReview: FIRST_REVIEW,
      })
    ).toThrow('A reviewed card must have lastReviewAt');
  });

  it('rejects an fsrsCard with a non-string cardId', () => {
    const fsrsCard: FsrsCard = {
      cardId: 12345,
      stability: 2.5,
      difficulty: 6.25,
      reps: 7,
      lapses: 2,
      scheduledDays: 9,
      learningStep: 3,
      dueAt: new Date(DUE),
      lastReviewAt: new Date(LAST_REVIEW),
      state: State.New,
      scheduleStatus: 'new' as const,
    };
    expect(() =>
      fromFsrsCard(fsrsCard, {
        correctReps: 1,
        firstReview: FIRST_REVIEW,
      })
    ).toThrow('Expected a string cardId');
  });
});

describe('round trip', () => {
  it.each(states)('is lossless for $name', ({ name }) => {
    const input = { ...baseState, state: name };
    const output = fromFsrsCard(toFsrsCard(input), {
      correctReps: input.correctReps,
      firstReview: input.firstReview,
    });
    expect(output).toEqual(input);
  });
});

describe('stabilityFast guard (FSRS-6)', () => {
  it('does not expose stabilityFast on the public card shape', async () => {
    const { DefaultScheduler } = await import('ts-fsrs');
    const scheduler = await DefaultScheduler({
      version: 'FSRS-6',
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    const card = scheduler.newCard({ cardId: 'guard', now: new Date('2026-01-05T08:00:00Z') });
    expect('stabilityFast' in card).toBe(false);
    // The CardState type persists only the fields shown below; stabilityFast is intentionally omitted.
    const mapped = toFsrsCard({ ...baseState, state: 'New' });
    expect(Object.keys(mapped)).not.toContain('stabilityFast');
  });
});
