import { describe, it, expect } from 'vitest';
import { type ReviewEventIn } from '@hanji/schemas';
import { type CardState } from './card-state.js';
import { applyReview } from './apply-review.js';
import { buildSchedulers } from './scheduler.js';

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

const baseEvent: ReviewEventIn = {
  id: '017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f9000',
  cardId: CARD_ID,
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
  it('throws when the state and event have different cardIds', async () => {
    const event = makeEvent({ cardId: 'differentId' });
    const schedulerLookup = await buildSchedulers([0.9]);
    expect(() => applyReview(baseState, event, schedulerLookup)).toThrow(
      /State cardId does not match event cardId/
    );
  });
});
