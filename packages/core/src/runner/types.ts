import { type CardDto, type ReviewEventIn } from '@hanji/schemas';
import { type CardState } from '../fsrs/card-state.js';
import { type Scheduler } from '../fsrs/scheduler.js';

export type RunnerState =
  | { state: 'prompt'; card: CardDto; current: CardState | null }
  | {
      state: 'answering';
      card: CardDto;
      current: CardState | null;
      startedAt: Date;
      hintUsed: boolean;
    }
  | {
      state: 'feedback';
      card: CardDto;
      previous: CardState | null;
      event: ReviewEventIn;
      next: CardState;
    }
  | { state: 'next'; card: CardDto; event: ReviewEventIn; next: CardState };

export type RunnerAction =
  | { type: 'start' }
  | { type: 'hint' }
  | { type: 'submit'; correct: boolean }
  | { type: 'easy' }
  | { type: 'continue' };

export type RunnerDeps = {
  now: () => Date;
  newEventId: () => string;
  retention: number;
  tz: string;
  getScheduler: (retention: number) => Scheduler;
  medianResponseMs: number | null;
  responseSampleCount: number;
};
