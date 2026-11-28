import { describe, it, expect, beforeAll } from 'vitest';
import { type CardDto } from '@hanji/schemas';
import { buildSchedulers } from '../fsrs/scheduler.js';
import { type CardState } from '../fsrs/card-state.js';
import { applyReview } from '../fsrs/apply-review.js';
import {
  advance,
  createSession,
  draftEvent,
  summarize,
  type QueueItem,
  type SessionAction,
  type SessionDeps,
} from './session-runner.js';
import fc from 'fast-check';

const NOW = new Date('2026-01-05T08:00:00.000Z');

const cardA: CardDto = {
  id: '9c6be017-63a3-4354-8e3f-ce287f5f2392',
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

const cardB: CardDto = {
  id: '2c6be017-63a3-4354-8e3f-ce287f5f2392',
  kind: 'production',
  position: 2,
  entry: null,
  kanji: {
    id: '22222222-2222-2222-2222-222222222222',
    glyph: '水',
    onReadings: ['スイ'],
    kunReadings: ['みず'],
    gloss: ['water'],
    freqRank: 10,
  },
};

function queueItem(card: CardDto, isNew = true): QueueItem {
  return { card, isNew };
}

function makeCard(id: string, kind: CardDto['kind']): CardDto {
  return {
    id,
    kind,
    position: 0,
    entry:
      kind === 'recognition'
        ? { id: uuid7(), script: 'x', reading: 'x', gloss: ['x'], pos: 'noun', freqRank: 1 }
        : null,
    kanji:
      kind === 'production'
        ? { id: uuid7(), glyph: 'x', onReadings: [], kunReadings: [], gloss: ['x'], freqRank: 1 }
        : null,
  };
}

/** A controllable clock so tests can advance time between actions. */
function makeClock(start = NOW) {
  let t = start.getTime();
  return { now: () => new Date(t), tick: (ms: number) => void (t += ms) };
}

let idCounter = 0;
const uuid7 = () => `017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f${(4000 + idCounter++).toString(16)}`;

let getScheduler: SessionDeps['getScheduler'];
let deps: SessionDeps;
beforeAll(async () => {
  getScheduler = await buildSchedulers([0.9]);
  deps = {
    now: () => NOW,
    newEventId: () => '017e8a1c-2b3d-7e7f-8a9b-0c1d2e3f4a56',
    retention: 0.9,
    tz: 'UTC',
    getScheduler,
    learnAheadMs: 20 * 60_000,
  };
});
describe('advance', () => {
  it('begins a session on the first queued card', () => {
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    const s = advance(session, { type: 'begin' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.state).toBe('answering');
    expect(s.runner?.card.id).toBe(cardA.id);
    expect(s.runner?.state === 'answering' ? s.runner.startedAt : null).toEqual(NOW);
    expect(s.queue).toEqual([queueItem(cardA), queueItem(cardB)]);
  });

  it('finishes immediately when the queue is empty', () => {
    const session = createSession([], new Map());
    const s = advance(session, { type: 'begin' }, deps);
    expect(s.status).toBe('finished');
    expect(s.runner).toBeNull();
  });

  it('records the final event, next state, response time and stats', () => {
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    const s = reviewCard(session);

    expect(s.status).toBe('running');
    expect(s.runner?.state).toBe('answering');
    expect(s.runner?.card.id).toBe(cardB.id);

    expect(s.events).toHaveLength(1);
    expect(s.events[0]!.cardId).toBe(cardA.id);

    const expected = applyReview(null, s.events[0]!, getScheduler);
    expect(s.cardStates.get(cardA.id)).toEqual(expected);

    expect(s.responseMs['recognition']).toEqual([0]);
    expect(s.responseMs['recall']).toBeUndefined();

    expect(s.stats).toEqual({ presented: 1, correct: 1, newIntroduced: 1 });

    // cardA is due again within learnAheadMs (10 min), so it's re-queued at
    // the back, behind cardB, and is no longer a new card.
    expect(s.queue).toEqual([queueItem(cardB), queueItem(cardA, false)]);
  });

  it('does not count a wrong answer as correct', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const s = reviewCard(session, false);
    expect(s.stats).toEqual({ presented: 1, correct: 0, newIntroduced: 1 });
  });

  it('auto-starts the presented card on begin', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const s = advance(session, { type: 'begin' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.state).toBe('answering');
    expect(s.runner?.state === 'answering' ? s.runner.startedAt : null).toEqual(NOW);
  });

  it('presents the next card in the answering state after continue', () => {
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    const s = reviewCard(session);
    expect(s.status).toBe('running');
    expect(s.runner?.state).toBe('answering');
    expect(s.runner?.card.id).toBe(cardB.id);
  });

  it('returns the identical session when start is repeated while answering', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const started = advance(session, { type: 'begin' }, deps);
    expect(advance(started, { type: 'start' }, deps)).toBe(started);
  });

  it('does not count a card with existing state as newly introduced', () => {
    const prior: CardState = {
      state: 'Review',
      cardId: cardA.id,
      due: NOW.toISOString(),
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
    const session = createSession([queueItem(cardA, false)], new Map([[cardA.id, prior]]));
    const s = reviewCard(session);
    expect(s.stats).toEqual({ presented: 1, correct: 1, newIntroduced: 0 });
    expect(s.cardStates.get(cardA.id)!.cardId).toBe(cardA.id);
  });

  it('finishes the session when no cards remain', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const s = reviewCard(session, true, { learnAheadMs: 0 });
    expect(s.status).toBe('finished');
    expect(s.runner).toBeNull();
    expect(s.events).toHaveLength(1);
    expect(s.stats).toEqual({ presented: 1, correct: 1, newIntroduced: 1 });
  });

  it('re-queues the card at the back when due again within learnAheadMs', () => {
    const longAhead = { ...deps, learnAheadMs: 1000 * 24 * 60 * 60_000 };
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    const s = reviewCard(session, true, longAhead);

    expect(s.status).toBe('running');
    expect(s.queue).toHaveLength(2);
    expect(s.queue[0]!.card.id).toBe(cardB.id);
    expect(s.queue[1]!.card.id).toBe(cardA.id);
    expect(s.queue[1]!.isNew).toBe(false);
    expect(s.runner?.card.id).toBe(cardB.id);
  });

  it('keeps the card out of the queue when due beyond learnAheadMs', () => {
    const noAhead = { ...deps, learnAheadMs: 0 };
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    const s = reviewCard(session, true, noAhead);

    expect(s.queue).toEqual([queueItem(cardB)]);
    expect(s.responseMs['recognition']).toEqual([0]);
  });

  it('returns the identical session for actions illegal in the current state', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const running = advance(session, { type: 'begin' }, deps);
    expect(advance(running, { type: 'begin' }, deps)).toBe(running);
    expect(advance(running, { type: 'easy' }, deps)).toBe(running);
    expect(advance(running, { type: 'continue' }, deps)).toBe(running);

    const submitted = advance(running, { type: 'submit', correct: true }, deps);
    expect(advance(submitted, { type: 'submit', correct: true }, deps)).toBe(submitted);
    expect(advance(submitted, { type: 'hint' }, deps)).toBe(submitted);
    expect(advance(submitted, { type: 'start' }, deps)).toBe(submitted);
  });

  it('ignores non-begin actions while idle', () => {
    const session = createSession([queueItem(cardA)], new Map());
    expect(advance(session, { type: 'start' }, deps)).toBe(session);
    expect(advance(session, { type: 'submit', correct: true }, deps)).toBe(session);
    expect(advance(session, { type: 'continue' }, deps)).toBe(session);
    expect(advance(session, { type: 'easy' }, deps)).toBe(session);
    expect(advance(session, { type: 'hint' }, deps)).toBe(session);
  });

  it('ignores every action once finished', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const finished = reviewCard(session, true, { learnAheadMs: 0 });
    expect(finished.status).toBe('finished');
    expect(advance(finished, { type: 'continue' }, deps)).toBe(finished);
    expect(advance(finished, { type: 'begin' }, deps)).toBe(finished);
    expect(advance(finished, { type: 'submit', correct: true }, deps)).toBe(finished);
  });

  it('tracks response times and stats per kind across multiple cards', () => {
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    let s = reviewCard(session, true, { learnAheadMs: 0 });
    s = reviewCard(s, true, { learnAheadMs: 0 });

    expect(s.status).toBe('finished');
    expect(s.events).toHaveLength(2);
    expect(s.responseMs['recognition']).toEqual([0]);
    expect(s.responseMs['production']).toEqual([0]);
    expect(s.stats).toEqual({ presented: 2, correct: 2, newIntroduced: 2 });
  });

  it('keeps a failed new card running and re-presents it', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: false }, deps);
    s = advance(s, { type: 'continue' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.card.id).toBe(cardA.id);
    expect(s.runner?.state).toBe('answering');
  });

  it('re-presents a failed card and ends only when the queue empties', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: false }, deps);
    s = advance(s, { type: 'continue' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.card.id).toBe(cardA.id);
    let i = 0;
    while (s.status === 'running' && i++ < 50) {
      s = advance(s, { type: 'submit', correct: true }, deps);
      s = advance(s, { type: 'continue' }, deps);
    }
    expect(s.status).toBe('finished');
    expect(i).toBeLessThan(50);
  });

  it('re-queues a Good new card once, then finishes on the second Good', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    s = advance(s, { type: 'continue' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.card.id).toBe(cardA.id);
    // A first Good on a new card is due about 10 minutes out (NOW + 600_000 ms),
    // which is inside the default 20-minute learn-ahead window, so the card
    // comes back once. The second Good graduates past the window.
    s = advance(s, { type: 'submit', correct: true }, deps);
    s = advance(s, { type: 'continue' }, deps);
    expect(s.status).toBe('finished');
  });

  it('Easy amends the event instead of adding a second one', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    s = advance(s, { type: 'easy' }, deps);
    s = advance(s, { type: 'continue' }, deps);

    expect(s.events).toHaveLength(1);
    expect(s.events[0]!.rating).toBe(4);
    const expected = applyReview(null, s.events[0]!, getScheduler);
    expect(s.cardStates.get(cardA.id)).toEqual(expected);
  });

  it('Easy is a no-op after a wrong answer', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: false }, deps);
    const before = s;
    s = advance(s, { type: 'easy' }, deps);
    expect(s).toBe(before);
  });

  it('Easy is a no-op after a hint', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'hint' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    const before = s;
    s = advance(s, { type: 'easy' }, deps);
    expect(s).toBe(before);
  });

  it('re-queues at the inclusive learn-ahead boundary', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    expect(s.runner?.state).toBe('feedback');
    const due = s.runner?.state === 'feedback' ? Date.parse(s.runner.next.due) : null;
    // A first Good on a new card is due 10 minutes after review (NOW + 600_000 ms).
    expect(due).toBe(NOW.getTime() + 600_000);

    // Inclusive boundary: due == now + learnAheadMs means re-queue.
    const atBoundary = advance(s, { type: 'continue' }, { ...deps, learnAheadMs: 600_000 });
    expect(atBoundary.status).toBe('running');
    expect(atBoundary.runner?.card.id).toBe(cardA.id);

    // One millisecond narrower means the card is not re-queued and the session ends.
    const justUnder = advance(s, { type: 'continue' }, { ...deps, learnAheadMs: 599_999 });
    expect(justUnder.status).toBe('finished');
  });

  it('presents a card even when nothing is due yet (soonest-card fallback)', () => {
    const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60_000).toISOString();
    const prior: CardState = {
      state: 'Review',
      cardId: cardA.id,
      due: future,
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
    const session = createSession([queueItem(cardA, false)], new Map([[cardA.id, prior]]));
    const s = advance(session, { type: 'begin' }, deps);
    expect(s.status).toBe('running');
    expect(s.runner?.state).toBe('answering');
    expect(s.runner?.card.id).toBe(cardA.id);
  });

  it('uses the median after five samples to grade a slow answer as Hard', () => {
    const clock = makeClock(NOW);
    const d = { ...deps, now: clock.now };
    const cards = Array.from({ length: 6 }, () => makeCard(uuid7(), 'recognition'));
    let session = createSession(
      cards.map((c) => queueItem(c, true)),
      new Map()
    );

    const stepThrough = (ms: number) => {
      session = advance(session, { type: 'begin' }, d);
      clock.tick(ms);
      session = advance(session, { type: 'submit', correct: true }, d);
      session = advance(session, { type: 'continue' }, d);
    };

    for (let _ = 0; _ < 4; _++) stepThrough(1000); // 4 samples @ 1000 ms
    stepThrough(2001); // 5th card @ 2001 ms with only 4 samples -> Good, not Hard
    expect(session.events[4]!.rating).toBe(3);

    stepThrough(2001); // 6th card @ 2001 ms with 5 samples -> median 1000 -> Hard
    expect(session.events).toHaveLength(6);
    expect(session.events[5]!.rating).toBe(2);
  });

  it('does not count samples of a different kind towards the median', () => {
    const clock = makeClock(NOW);
    const d = { ...deps, now: clock.now };
    const recognitions = Array.from({ length: 5 }, () => makeCard(uuid7(), 'recognition'));
    const productions = Array.from({ length: 2 }, () => makeCard(uuid7(), 'production'));
    let session = createSession(
      [...recognitions, ...productions].map((c) => queueItem(c, true)),
      new Map()
    );

    const stepThrough = (ms: number) => {
      session = advance(session, { type: 'begin' }, d);
      clock.tick(ms);
      session = advance(session, { type: 'submit', correct: true }, d);
      session = advance(session, { type: 'continue' }, d);
    };

    for (let _ = 0; _ < 5; _++) stepThrough(1000); // recognition median = 1000, 5 samples
    // A slow production card: production has no samples, so slowness is not assessed.
    stepThrough(2001);
    expect(session.events).toHaveLength(6);
    expect(session.events[5]!.cardId).toBe(productions[0]!.id);
    expect(session.events[5]!.rating).toBe(3);
  });
});

const actionArb = fc.oneof(
  fc.constant<SessionAction>({ type: 'begin' }),
  fc.constant<SessionAction>({ type: 'hint' }),
  fc.constant<SessionAction>({ type: 'continue' }),
  fc.constant<SessionAction>({ type: 'easy' }),
  fc
    .tuple(fc.constant<{ type: 'submit' }>({ type: 'submit' }), fc.boolean())
    .map(([action, correct]) => ({ ...action, correct }))
);

describe('advance: property tests', () => {
  it('maintains invariants across random action sequences', () => {
    fc.assert(
      fc.property(
        fc.array(actionArb, { minLength: 1, maxLength: 60 }),
        (actions: SessionAction[]) => {
          const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
          let s = session;
          for (const action of actions) {
            const next = advance(s, action, deps);

            // No card id appears twice in the queue.
            const ids = next.queue.map((item) => item.card.id);
            expect(new Set(ids).size).toBe(ids.length);

            // Every presented card produces exactly one final event.
            expect(next.events.length).toBe(next.stats.presented);

            // Correct reviews never exceed presented reviews.
            expect(next.stats.correct).toBeLessThanOrEqual(next.stats.presented);

            // Once finished, the session never changes.
            if (next.status === 'finished') {
              expect(advance(next, action, deps)).toBe(next);
            }

            s = next;
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
describe('summarize', () => {
  it('computes the session summary from the final state', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const finished = reviewCard(session);
    const summary = summarize(finished);
    expect(summary.cardsReviewed).toBe(1);
    expect(summary.accuracy).toBe(1);
    expect(summary.newCardsIntroduced).toBe(1);
    expect(summary.events).toHaveLength(1);

    const empty = summarize(createSession([], new Map()));
    expect(empty.cardsReviewed).toBe(0);
    expect(empty.accuracy).toBe(0);
    expect(empty.newCardsIntroduced).toBe(0);
    expect(empty.events).toEqual([]);
  });

  it('reports 0.5 accuracy for one right and one wrong', () => {
    const session = createSession([queueItem(cardA), queueItem(cardB)], new Map());
    let s = reviewCard(session, true);
    s = reviewCard(s, false);
    expect(summarize(s).accuracy).toBe(0.5);
    expect(s.stats).toEqual({ presented: 2, correct: 1, newIntroduced: 2 });
  });

  it('counts a re-presented card once in newCardsIntroduced', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = reviewCard(session, true, { learnAheadMs: 600_000 });
    s = reviewCard(s, true, { learnAheadMs: 600_000 });
    expect(s.status).toBe('finished');
    expect(s.stats).toEqual({ presented: 2, correct: 2, newIntroduced: 1 });
  });

  it('does not count a card with prior state as newly introduced', () => {
    const prior: CardState = {
      state: 'Review',
      cardId: cardA.id,
      due: NOW.toISOString(),
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
    const session = createSession([queueItem(cardA, false)], new Map([[cardA.id, prior]]));
    const finished = reviewCard(session);
    expect(summarize(finished).newCardsIntroduced).toBe(0);
  });
});

describe('draftEvent', () => {
  it('returns null while answering', () => {
    const session = createSession([queueItem(cardA)], new Map());
    const s = advance(session, { type: 'begin' }, deps);
    expect(draftEvent(s)).toBeNull();
  });

  it('returns the event in feedback', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    const event = draftEvent(s);
    expect(event).not.toBeNull();
    expect(event!.cardId).toBe(cardA.id);
  });

  it('returns the amended event with the same id after easy', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    const before = draftEvent(s)!;
    s = advance(s, { type: 'easy' }, deps);
    const after = draftEvent(s)!;
    expect(after.id).toBe(before.id);
    expect(after.rating).toBe(4);
  });

  it('returns null after continue', () => {
    const session = createSession([queueItem(cardA)], new Map());
    let s = advance(session, { type: 'begin' }, deps);
    s = advance(s, { type: 'submit', correct: true }, deps);
    s = advance(s, { type: 'continue' }, deps);
    expect(draftEvent(s)).toBeNull();
  });
});

function reviewCard(
  session: ReturnType<typeof createSession>,
  correct = true,
  overrides: Partial<SessionDeps> = {}
) {
  const d = { ...deps, ...overrides };
  let s = session.status === 'idle' ? advance(session, { type: 'begin' }, d) : session;
  s = advance(s, { type: 'submit', correct }, d);
  s = advance(s, { type: 'continue' }, d);
  return s;
}
