import { MAX_RESPONSE_MS, Rating, type ReviewEventIn } from '@hanji/schemas';
import { applyReview } from '../fsrs/apply-review.js';
import { gradeAnswer } from '../grading/grade-answer.js';
import type { RunnerAction, RunnerDeps, RunnerState } from './types.js';

/**
 * Advances the card-runner state machine by one action.
 *
 * This is a pure transition function: it never mutates `state`, and all
 * non-determinism (clock, event ids, retention, time zone, scheduler) comes
 * in through `deps`. Illegal actions are no ops.
 *
 * Transitions:
 * - `prompt` + `start`: moves to `answering` and records the start time from `deps.now()`.
 * - `answering` + `hint`: marks the hint as used. The learner can then answer, but the rating
 *   is capped at Hard and Easy is no longer offered.
 * - `answering` + `submit`: reads the clock once, clamps the elapsed time to
 *   `[0, MAX_RESPONSE_MS]`, grades the answer, builds the review event (one new
 *   id from `deps.newEventId()`), and computes the next card state with `applyReview`
 *   (client-first scheduling). Moves to `feedback`.
 * - `feedback` + `easy`: allowed only after a correct answer with no hint that
 *   is not already Easy. Amends the existing event's rating to Easy (same id and
 *   timestamp, so no second event is emitted) and recomputes `next` from
 *   `previous`, so Easy is not applied on top of the earlier rating.
 * - `feedback` + `continue`: moves to `next`.
 * - `next`: terminal. Every action is ignored. The caller picks the next card
 *   and starts a fresh `prompt` state.
 *
 * @param state - Current runner state.
 * @param action - Action to apply.
 * @param deps - Injected dependencies: `now`, `newEventId`, `retention`, `tz`,
 *   `getScheduler`, `medianResponseMs` and `responseSampleCount`.
 * @returns The next runner state, or `state` itself if the action is not
 *   valid in the current state.
 * @throws {Error} If `deps.getScheduler` has no scheduler for `deps.retention`
 *   (thrown from `applyReview` on `submit` or `easy`).
 */
export function step(state: RunnerState, action: RunnerAction, deps: RunnerDeps): RunnerState {
  switch (state.state) {
    case 'prompt':
      if (action.type !== 'start') return state;
      return {
        state: 'answering',
        card: state.card,
        current: state.current,
        startedAt: deps.now(),
        hintUsed: false,
      };
    case 'answering':
      switch (action.type) {
        case 'hint':
          return { ...state, hintUsed: true };
        case 'submit':
          return submit(state, action, deps);
        default:
          return state;
      }
    case 'feedback':
      switch (action.type) {
        case 'easy':
          return amendToEasy(state, deps);
        case 'continue':
          return { state: 'next', card: state.card, event: state.event, next: state.next };
        default:
          return state;
      }
    case 'next':
      return state;
  }
}

function submit(
  state: Extract<
    RunnerState,
    {
      state: 'answering';
    }
  >,
  action: { type: 'submit'; correct: boolean },
  deps: RunnerDeps
): RunnerState {
  const at = deps.now();
  const responseMs = Math.min(
    Math.max(at.getTime() - state.startedAt.getTime(), 0),
    MAX_RESPONSE_MS
  );
  const rating = gradeAnswer({
    correct: action.correct,
    hintUsed: state.hintUsed,
    easyChosen: false,
    responseMs,
    medianMs: deps.medianResponseMs,
    sampleCount: deps.responseSampleCount,
  });
  const event: ReviewEventIn = {
    id: deps.newEventId(),
    cardId: state.card.id,
    reviewedAt: at.toISOString(),
    tz: deps.tz,
    retention: deps.retention,
    rating,
    responseMs,
    correct: action.correct,
    hintUsed: state.hintUsed,
  };
  const next = applyReview(state.current, event, deps.getScheduler);
  return {
    state: 'feedback',
    card: state.card,
    previous: state.current,
    event,
    next: next,
  };
}

function amendToEasy(
  state: Extract<RunnerState, { state: 'feedback' }>,
  deps: RunnerDeps
): RunnerState {
  const { event } = state;
  const allowed = event.correct && !event.hintUsed && event.rating !== Rating.Easy;
  if (!allowed) return state;

  const amended: ReviewEventIn = { ...event, rating: Rating.Easy };
  const next = applyReview(state.previous, amended, deps.getScheduler);

  return { ...state, event: amended, next };
}
