import { State } from 'ts-fsrs';
import { type UserCardState, type CardStateName } from '@hanji/schemas';
import { type FsrsCard } from './scheduler.js';

export const STATE_TO_NAME = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
} as const satisfies Record<State, CardStateName>;

export const NAME_TO_STATE = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
} as const satisfies Record<CardStateName, State>;

const STATE_TO_SCHEDULE_STATUS = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'learning',
} as const satisfies Record<State, FsrsCard['scheduleStatus']>;

export type CardState = Omit<UserCardState, 'lastSeq'>;

export function toFsrsCard(cardState: CardState): FsrsCard {
  const state = NAME_TO_STATE[cardState.state];
  return {
    cardId: cardState.cardId,
    stability: cardState.stability,
    difficulty: cardState.difficulty,
    dueAt: new Date(cardState.due),
    reps: cardState.reps,
    lapses: cardState.lapses,
    scheduledDays: cardState.scheduledDays,
    learningStep: cardState.learningStep,
    lastReviewAt: new Date(cardState.lastReview),
    state,
    scheduleStatus: STATE_TO_SCHEDULE_STATUS[state],
  };
}

export function fromFsrsCard(
  card: FsrsCard,
  derived: { correctReps: number; firstReview: string }
): CardState {
  if (card.lastReviewAt === null) {
    throw new Error('A reviewed card must have lastReviewAt');
  }
  if (typeof card.cardId !== 'string') {
    throw new Error('Expected a string cardId');
  }
  return {
    state: STATE_TO_NAME[card.state],
    cardId: card.cardId,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    due: card.dueAt.toISOString(),
    lastReview: card.lastReviewAt.toISOString(),
    correctReps: derived.correctReps,
    firstReview: derived.firstReview,
  };
}
