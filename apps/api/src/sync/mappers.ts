import { type NewUserCard, type ReviewEvent, type UserCard } from '@hanji/db';
import { type CardState } from '@hanji/core';
import { type ReviewEventIn, type UserCardState } from '@hanji/schemas';

/** DB review_event row -> the shape core's replayCard expects. */
export function toReviewEventIn(row: ReviewEvent): ReviewEventIn {
  return {
    id: row.id,
    cardId: row.cardId,
    reviewedAt: row.reviewedAt.toISOString(),
    tz: row.tz,
    retention: row.retention,
    rating: row.rating,
    responseMs: row.responseMs,
    correct: row.correct,
    hintUsed: row.hintUsed,
  };
}

/** Core CardState -> user_card insert row. */
export function toUserCardRow(userId: string, state: CardState, lastSeq: number): NewUserCard {
  return {
    userId,
    cardId: state.cardId,
    state: state.state,
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    lastReview: new Date(state.lastReview),
    lastSeq,
    correctReps: state.correctReps,
    firstReview: new Date(state.firstReview),
    scheduledDays: state.scheduledDays,
    learningStep: state.learningStep,
  };
}

/** DB user_card row -> wire UserCardState. */
export function toUserCardState(row: UserCard): UserCardState {
  return {
    cardId: row.cardId,
    state: row.state,
    due: row.due.toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.lastReview.toISOString(),
    lastSeq: row.lastSeq,
    correctReps: row.correctReps,
    firstReview: row.firstReview.toISOString(),
    scheduledDays: row.scheduledDays,
    learningStep: row.learningStep,
  };
}
