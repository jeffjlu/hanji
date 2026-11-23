import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  Rating,
  MAX_RESPONSE_MS,
  reviewEventInSchema,
  type CardDto,
  type ReviewEventIn,
} from '@hanji/schemas';
import { buildSchedulers } from '../fsrs/scheduler.js';
import { type CardState } from '../fsrs/card-state.js';
import { applyReview } from '../fsrs/apply-review.js';
import { step } from './step.js';
import fc from 'fast-check';
import type { RunnerAction, RunnerDeps, RunnerState } from './types.js';

const CARD_ID = '9c6be017-63a3-4354-8e3f-ce287f5f2392';
const EVENT_ID = '017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f4a56';
const NOW = new Date('2026-01-05T08:00:00.000Z');

const card: CardDto = {
  id: CARD_ID,
  kind: 'recognition',
  position: 1,
  entry: {
    id: '11111111-1111-1111-1111-111111111111',
    script: '水',
    reading: 'みず',
    gloss: ['water'],
    pos: 'noun',
    freqRank: 10,
  },
  kanji: null,
};

const nextCardState: CardState = {
  state: 'Review',
  cardId: CARD_ID,
  due: '2026-02-01T08:09:10.000Z',
  stability: 2.5,
  difficulty: 6.25,
  reps: 3,
  lapses: 0,
  lastReview: NOW.toISOString(),
  correctReps: 1,
  firstReview: NOW.toISOString(),
  scheduledDays: 4,
  learningStep: 0,
};

const prevCardState: CardState = {
  ...nextCardState,
  stability: 1.0,
  difficulty: 3.0,
  reps: 1,
};

const baseEvent: ReviewEventIn = {
  id: EVENT_ID,
  cardId: CARD_ID,
  reviewedAt: NOW.toISOString(),
  tz: 'UTC',
  retention: 0.9,
  rating: Rating.Good,
  responseMs: 5000,
  correct: true,
  hintUsed: false,
};

function event(o: Partial<ReviewEventIn>): ReviewEventIn {
  return { ...baseEvent, ...o };
}

function fb(
  o: Partial<ReviewEventIn>,
  previous: CardState | null = null
): Extract<RunnerState, { state: 'feedback' }> {
  return { ...feedbackState(), previous, event: event(o) };
}

let getScheduler: RunnerDeps['getScheduler'];
let deps: RunnerDeps;
beforeAll(async () => {
  getScheduler = await buildSchedulers([0.9]);
  deps = {
    now: () => NOW,
    newEventId: () => EVENT_ID,
    retention: 0.9,
    tz: 'UTC',
    getScheduler,
    medianResponseMs: null,
    responseSampleCount: 0,
  };
});

function promptState(): Extract<RunnerState, { state: 'prompt' }> {
  return { state: 'prompt', card, current: null };
}

function answeringState(): Extract<RunnerState, { state: 'answering' }> {
  return {
    state: 'answering',
    card,
    current: null,
    startedAt: new Date(NOW.getTime() - 5000),
    hintUsed: false,
  };
}

function feedbackState(): Extract<RunnerState, { state: 'feedback' }> {
  return {
    state: 'feedback',
    card,
    previous: null,
    event: baseEvent,
    next: nextCardState,
  };
}

function nextRunnerState(): Extract<RunnerState, { state: 'next' }> {
  return { state: 'next', card, event: baseEvent, next: nextCardState };
}

type StepCase = {
  name: string;
  action: RunnerAction;
  check: (result: RunnerState) => void;
};

/** Asserts that `step` returned the input state unchanged (same reference). */
const unchanged =
  (state: RunnerState): StepCase['check'] =>
  (result) =>
    expect(result).toBe(state);

function isAnswering(result: RunnerState): result is Extract<RunnerState, { state: 'answering' }> {
  return result.state === 'answering';
}

function isFeedback(result: RunnerState): result is Extract<RunnerState, { state: 'feedback' }> {
  return result.state === 'feedback';
}

function isNext(result: RunnerState): result is Extract<RunnerState, { state: 'next' }> {
  return result.state === 'next';
}
describe('step', () => {
  describe('in the "prompt" state', () => {
    const state = promptState();
    it.each<StepCase>([
      {
        name: '"start" moves to "answering"',
        action: { type: 'start' },
        check: (result) => {
          if (!isAnswering(result)) throw new Error('unreachable');
          expect(result.state).toBe('answering');
          expect(result.startedAt).toEqual(NOW);
          expect(result.hintUsed).toBe(false);
          expect(result.card).toBe(state.card);
          expect(result.current).toBe(state.current);
        },
      },
      {
        name: '"hint" is ignored',
        action: { type: 'hint' },
        check: unchanged(state),
      },
      {
        name: '"submit" is ignored',
        action: { type: 'submit', correct: true },
        check: unchanged(state),
      },
      {
        name: '"easy" is ignored',
        action: { type: 'easy' },
        check: unchanged(state),
      },
      {
        name: '"continue" is ignored',
        action: { type: 'continue' },
        check: unchanged(state),
      },
    ])('$name', ({ action, check }) => {
      const result = step(state, action, deps);
      check(result);
    });
  });

  describe('in the "answering" state', () => {
    const state = answeringState();
    it.each<StepCase>([
      {
        name: '"start" is ignored',
        action: { type: 'start' },
        check: unchanged(state),
      },
      {
        name: '"hint" marks the hint as used',
        action: { type: 'hint' },
        check: (result) => {
          if (!isAnswering(result)) throw new Error('unreachable');
          expect(result.state).toBe('answering');
          expect(result).not.toBe(state);
          expect(result.hintUsed).toBe(true);
          expect(result.card).toBe(state.card);
          expect(result.startedAt).toBe(state.startedAt);
        },
      },
      {
        name: '"submit" moves to "feedback" and records a review event',
        action: { type: 'submit', correct: true },
        check: (result) => {
          if (!isFeedback(result)) throw new Error('unreachable');
          expect(result.state).toBe('feedback');
          expect(result).not.toBe(state);
          expect(result.card).toBe(state.card);
          expect(result.previous).toBe(state.current);
          expect(result.event.id).toBe(EVENT_ID);
          expect(result.event.cardId).toBe(CARD_ID);
          expect(result.event.rating).toBe(Rating.Good);
          expect(result.event.correct).toBe(true);
          expect(result.event.hintUsed).toBe(false);
          expect(result.event.responseMs).toBe(5000);
          expect(result.next.cardId).toBe(CARD_ID);
        },
      },
      {
        name: '"easy" is ignored',
        action: { type: 'easy' },
        check: unchanged(state),
      },
      {
        name: '"continue" is ignored',
        action: { type: 'continue' },
        check: unchanged(state),
      },
    ])('$name', ({ action, check }) => {
      const result = step(state, action, deps);
      check(result);
    });
  });

  describe('in the "feedback" state', () => {
    const state = feedbackState();
    it.each<StepCase>([
      {
        name: '"start" is ignored',
        action: { type: 'start' },
        check: unchanged(state),
      },
      {
        name: '"hint" is ignored',
        action: { type: 'hint' },
        check: unchanged(state),
      },
      {
        name: '"submit" is ignored',
        action: { type: 'submit', correct: true },
        check: unchanged(state),
      },
      {
        name: '"easy" amends the event rating to Easy',
        action: { type: 'easy' },
        check: (result) => {
          if (!isFeedback(result)) throw new Error('unreachable');
          expect(result.state).toBe('feedback');
          expect(result).not.toBe(state);
          expect(result.event.rating).toBe(Rating.Easy);
          expect(result.event.correct).toBe(true);
          expect(result.event.hintUsed).toBe(false);
          expect(result.event).not.toBe(state.event);
          expect(result.next).not.toBe(state.next);
          expect(result.next.cardId).toBe(CARD_ID);
        },
      },
      {
        name: '"continue" moves to "next"',
        action: { type: 'continue' },
        check: (result) => {
          if (!isNext(result)) throw new Error('unreachable');
          expect(result.state).toBe('next');
          expect(result.card).toBe(state.card);
          expect(result.event).toBe(state.event);
          expect(result.next).toBe(state.next);
        },
      },
    ])('$name', ({ action, check }) => {
      const result = step(state, action, deps);
      check(result);
    });
  });

  describe('in the "next" state', () => {
    const state = nextRunnerState();
    it.each<StepCase>([
      {
        name: '"start" is ignored',
        action: { type: 'start' },
        check: unchanged(state),
      },
      {
        name: '"hint" is ignored',
        action: { type: 'hint' },
        check: unchanged(state),
      },
      {
        name: '"submit" is ignored',
        action: { type: 'submit', correct: true },
        check: unchanged(state),
      },
      {
        name: '"easy" is ignored',
        action: { type: 'easy' },
        check: unchanged(state),
      },
      {
        name: '"continue" is ignored',
        action: { type: 'continue' },
        check: unchanged(state),
      },
    ])('$name', ({ action, check }) => {
      const result = step(state, action, deps);
      check(result);
    });
  });
});

describe('submit', () => {
  it.each([
    { name: 'wrong → Again', correct: false, hint: false, ms: 1000, rating: Rating.Again },
    { name: 'hint + correct → Hard', correct: true, hint: true, ms: 1000, rating: Rating.Hard },
    {
      name: 'slow (4001ms, median 2000, n=5) → Hard',
      correct: true,
      hint: false,
      ms: 4001,
      rating: Rating.Hard,
      median: 2000,
      n: 5,
    },
    {
      name: 'exactly 2× median → Good',
      correct: true,
      hint: false,
      ms: 4000,
      rating: Rating.Good,
      median: 2000,
      n: 5,
    },
    {
      name: 'slow but n=4 → Good',
      correct: true,
      hint: false,
      ms: 9000,
      rating: Rating.Good,
      median: 2000,
      n: 4,
    },
  ])('$name', ({ correct, hint, ms, rating, median = null, n = 0 }) => {
    const s = { ...answeringState(), hintUsed: hint, startedAt: new Date(NOW.getTime() - ms) };
    const r = step(
      s,
      { type: 'submit', correct },
      {
        ...deps,
        medianResponseMs: median,
        responseSampleCount: n,
      }
    );
    if (!isFeedback(r)) throw new Error('unreachable');
    expect(r.event).toMatchObject({ rating, correct, hintUsed: hint, responseMs: ms });
  });

  it('clamps responseMs to [0, MAX_RESPONSE_MS]', () => {
    const long = { ...answeringState(), startedAt: new Date(NOW.getTime() - 20 * 60_000) };
    const backwards = { ...answeringState(), startedAt: new Date(NOW.getTime() + 5000) };
    for (const [s, ms] of [
      [long, MAX_RESPONSE_MS],
      [backwards, 0],
    ] as const) {
      const r = step(s, { type: 'submit', correct: true }, deps);
      if (!isFeedback(r)) throw new Error('unreachable');
      expect(r.event.responseMs).toBe(ms);
    }
  });

  it('takes tz, retention and the timestamp from deps, and emits a schema-valid event', async () => {
    const d = {
      ...deps,
      tz: 'Asia/Tokyo',
      retention: 0.8,
      getScheduler: await buildSchedulers([0.8]),
    };
    const r = step(answeringState(), { type: 'submit', correct: true }, d);
    if (!isFeedback(r)) throw new Error('unreachable');
    expect(r.event).toMatchObject({
      tz: 'Asia/Tokyo',
      retention: 0.8,
      reviewedAt: NOW.toISOString(),
    });
    expect(reviewEventInSchema.safeParse(r.event).success).toBe(true);
  });

  it('computes next with applyReview from the previous state (non-null current)', () => {
    const s = { ...answeringState(), current: nextCardState };
    const r = step(s, { type: 'submit', correct: true }, deps);
    if (!isFeedback(r)) throw new Error('unreachable');
    expect(r.previous).toBe(nextCardState);
    expect(r.next).toEqual(applyReview(nextCardState, r.event, getScheduler));
  });
});

describe('easy', () => {
  it.each([
    { name: 'after a wrong answer', o: { rating: Rating.Again, correct: false } },
    { name: 'after a hint', o: { rating: Rating.Hard, hintUsed: true } },
    { name: 'when already Easy', o: { rating: Rating.Easy } },
  ])('is ignored $name', ({ o }) => {
    const s = fb(o);
    expect(step(s, { type: 'easy' }, deps)).toBe(s);
  });

  it('is allowed after a slow Hard (no hint) and wins over the speed rule', () => {
    const r = step(fb({ rating: Rating.Hard }), { type: 'easy' }, deps);
    if (!isFeedback(r)) throw new Error('unreachable');
    expect(r.event.rating).toBe(Rating.Easy);
  });

  it('amends in place: same id/reviewedAt/responseMs, no new id, next rebuilt from previous', () => {
    const newEventId = vi.fn(() => EVENT_ID);
    const s = fb({ responseMs: 1234 }, prevCardState);
    const r = step(s, { type: 'easy' }, { ...deps, newEventId });
    if (!isFeedback(r)) throw new Error('unreachable');
    expect(newEventId).not.toHaveBeenCalled();
    expect(r.event).toEqual({ ...s.event, rating: Rating.Easy });
    expect(r.next).toEqual(applyReview(prevCardState, r.event, getScheduler));
    // double-application guard: next must be rebuilt from `previous`, not from the old `next`
    expect(r.next).not.toEqual(applyReview(s.next, r.event, getScheduler));
  });

  it('is idempotent: a second press is a no-op', () => {
    const once = step(fb({}), { type: 'easy' }, deps);
    expect(step(once, { type: 'easy' }, deps)).toBe(once);
  });
});

describe('step: purity and the "one event per presentation" invariant', () => {
  const actionArb = fc.oneof(
    fc.constant<RunnerAction>({ type: 'start' }),
    fc.constant<RunnerAction>({ type: 'hint' }),
    fc.constant<RunnerAction>({ type: 'easy' }),
    fc.constant<RunnerAction>({ type: 'continue' }),
    fc.boolean().map((correct): RunnerAction => ({ type: 'submit', correct }))
  );

  it('never throws, mints at most one event id, and never leaves "next"', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 30 }), (actions) => {
        const newEventId = vi.fn(() => EVENT_ID);
        let s: RunnerState = promptState();
        let reachedNext = false;
        for (const a of actions) {
          const before = s;
          s = step(s, a, { ...deps, newEventId });
          if (reachedNext) expect(s).toBe(before);
          if (s.state === 'next') reachedNext = true;
        }
        expect(newEventId.mock.calls.length).toBeLessThanOrEqual(1);
      }),
      { seed: 42, numRuns: 200 }
    );
  });

  function deepFreeze<T>(value: T): T {
    Object.freeze(value);
    for (const prop of Object.keys(value as object)) {
      const child = (value as Record<string, unknown>)[prop];
      if (child && typeof child === 'object' && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
    return value;
  }

  it('is pure: frozen state, fixtures and deps are not mutated', () => {
    const frozen = deepFreeze({
      state: feedbackState(),
      event: baseEvent,
      card,
      nextCardState,
      deps,
    });
    const s = frozen.state as Extract<RunnerState, { state: 'feedback' }>;
    const afterSubmit = step(s, { type: 'submit', correct: true }, frozen.deps);
    const afterEasy = step(afterSubmit, { type: 'easy' }, frozen.deps);
    const afterContinue = step(afterEasy, { type: 'continue' }, frozen.deps);
    expect(afterSubmit.state).toBe('feedback');
    expect(afterEasy.state).toBe('feedback');
    expect(afterContinue.state).toBe('next');
    expect(Object.isFrozen(frozen.state)).toBe(true);
    expect(Object.isFrozen(frozen.deps)).toBe(true);
  });

  it('does not depend on the system clock (uses deps.now)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
      const r1 = step(answeringState(), { type: 'submit', correct: true }, deps);
      if (!isFeedback(r1)) throw new Error('unreachable');
      vi.setSystemTime(new Date('2040-06-15T12:00:00Z'));
      const r2 = step(answeringState(), { type: 'submit', correct: true }, deps);
      if (!isFeedback(r2)) throw new Error('unreachable');
      expect(r1.event.responseMs).toBe(r2.event.responseMs);
      expect(r1.event.reviewedAt).toBe(NOW.toISOString());
      expect(r2.event.reviewedAt).toBe(NOW.toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a single clock reading for reviewedAt and responseMs', () => {
    const t1 = new Date('2026-01-05T08:00:05.000Z');
    const t2 = new Date('2026-01-05T08:00:09.000Z');
    const now = vi.fn().mockReturnValueOnce(t1).mockReturnValue(t2);
    const result = step(answeringState(), { type: 'submit', correct: true }, { ...deps, now });
    if (!isFeedback(result)) throw new Error('unreachable');
    expect(now).toHaveBeenCalledTimes(1);
    expect(result.event.reviewedAt).toBe(t1.toISOString());
    expect(result.event.responseMs).toBe(t1.getTime() - answeringState().startedAt.getTime());
  });
});
