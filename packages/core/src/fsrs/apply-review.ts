import { type ReviewEventIn } from '@hanji/schemas';
import { type CardState, toFsrsCard, fromFsrsCard } from './card-state.js';
import { TO_FSRS_RATING } from './rating.js';
import { type Scheduler, type FsrsCard } from './scheduler.js';

/**
 * Applies a review event to a card and returns its updated FSRS state.
 *
 * Creates a new card when `state` is `null`, otherwise converts the existing
 * state into an FSRS card. The scheduler is selected using the event's target
 * retention, and the review is evaluated at the event's `reviewedAt` timestamp.
 *
 * @param state - The card's previous state, or `null` if it has never been reviewed.
 * @param event - The review event to apply.
 * @param getScheduler - Returns an FSRS scheduler configured for the given target retention.
 * @returns The updated card state after applying the review.
 * @throws {Error} If the existing state's `cardId` does not match the event's `cardId`.
 */
export function applyReview(
  state: CardState | null,
  event: ReviewEventIn,
  getScheduler: (retention: number) => Scheduler
): CardState {
  if (state && state.cardId !== event.cardId)
    throw new Error('State cardId does not match event cardId');
  const at = new Date(event.reviewedAt);
  const scheduler = getScheduler(event.retention);
  const card = state === null ? startingCard(scheduler, event.cardId, at) : toFsrsCard(state);
  const result = scheduler.review({ card, grade: TO_FSRS_RATING[event.rating], now: at });
  return fromFsrsCard(result.card, {
    correctReps: (state?.correctReps ?? 0) + (event.correct ? 1 : 0),
    firstReview: state?.firstReview ?? at.toISOString(),
  });
}

function startingCard(scheduler: Scheduler, cardId: string, reviewedAt: Date): FsrsCard {
  return scheduler.newCard({ cardId, now: reviewedAt });
}
