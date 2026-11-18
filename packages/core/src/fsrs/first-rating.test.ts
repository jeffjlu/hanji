import { describe, it, expect } from 'vitest';
import { replayCard } from './replay.js';
import { type ReviewEventIn } from '@hanji/schemas';

const CARD_ID = '9c6be017-63a3-4354-8e3f-ce287f5f2392';
const AT = '2026-01-05T08:00:00.000Z';

function firstEvent(rating: 1 | 2 | 3 | 4): ReviewEventIn {
  return {
    id: '017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f4a56',
    cardId: CARD_ID,
    reviewedAt: AT,
    tz: 'UTC',
    retention: 0.9,
    rating,
    responseMs: 5000,
    correct: rating !== 1,
    hintUsed: false,
  };
}

describe('first rating out of New', () => {
  it.each([
    { name: 'Again', rating: 1, state: 'Learning', correctReps: 0 },
    { name: 'Hard', rating: 2, state: 'Learning', correctReps: 1 },
    { name: 'Easy', rating: 4, state: 'Review', correctReps: 1 },
  ] as const)('$name: New → $state', async ({ rating, state, correctReps }) => {
    const final = await replayCard([firstEvent(rating)]);
    expect(final).not.toBeNull();
    expect(final!.state).toBe(state);
    expect(final!.correctReps).toBe(correctReps);
    expect(final!.firstReview).toBe(AT);
  });
});
