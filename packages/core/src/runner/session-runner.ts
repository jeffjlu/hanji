import { type CardDto, type ReviewEventIn } from '@hanji/schemas';
import type { CardState } from '../fsrs/card-state.js';
import { step } from '../runner/step.js';
import type { RunnerAction, RunnerDeps, RunnerState } from '../runner/types.js';

export const LEARN_AHEAD_MS = 20 * 60_000;

export type QueueItem = { card: CardDto; isNew: boolean };
export type SessionDeps = Omit<RunnerDeps, 'medianResponseMs' | 'responseSampleCount'> & {
  learnAheadMs?: number;
};

export type SessionState = {
  /** The queue of cards to present, including the card currently on screen. */
  queue: readonly QueueItem[];
  cardStates: ReadonlyMap<string, CardState>;
  runner: RunnerState | null;
  events: readonly ReviewEventIn[];
  responseMs: Readonly<Record<string, readonly number[]>>;
  stats: { presented: number; correct: number; newIntroduced: number };
  status: 'idle' | 'running' | 'finished';
};

export type SessionAction = RunnerAction | { type: 'begin' };

function runnerDeps(
  responseMs: SessionState['responseMs'],
  kind: string,
  deps: SessionDeps
): RunnerDeps {
  const samples = responseMs[kind] ?? [];
  return { ...deps, medianResponseMs: median(samples), responseSampleCount: samples.length };
}

/** Builds the runner for a card and starts it, so every presented card is answerable. */
function present(
  card: CardDto,
  cardStates: ReadonlyMap<string, CardState>,
  responseMs: SessionState['responseMs'],
  deps: SessionDeps
): RunnerState {
  const prompt: RunnerState = {
    state: 'prompt',
    card,
    current: cardStates.get(card.id) ?? null,
  };
  return step(prompt, { type: 'start' }, runnerDeps(responseMs, card.kind, deps));
}

export type SessionSummary = {
  cardsReviewed: number;
  accuracy: number;
  newCardsIntroduced: number;
  events: readonly ReviewEventIn[];
};

export function createSession(
  queue: readonly QueueItem[],
  initialStates: ReadonlyMap<string, CardState>
): SessionState {
  return {
    queue,
    cardStates: new Map(initialStates),
    runner: null,
    events: [],
    responseMs: {},
    stats: { presented: 0, correct: 0, newIntroduced: 0 },
    status: 'idle',
  };
}

export function advance(
  session: SessionState,
  action: SessionAction,
  deps: SessionDeps
): SessionState {
  switch (session.status) {
    case 'idle': {
      if (action.type !== 'begin') return session;
      const card = pickNext(session.queue, session.cardStates, deps.now);
      if (!card) return { ...session, status: 'finished' };
      return {
        ...session,
        status: 'running',
        runner: present(card, session.cardStates, session.responseMs, deps),
      };
    }
    case 'running': {
      if (action.type === 'begin' || !session.runner) return session;
      const runner = step(
        session.runner,
        action,
        runnerDeps(session.responseMs, session.runner.card.kind, deps)
      );
      if (runner.state === 'next') return finalizeCard(session, runner, deps);
      return runner === session.runner ? session : { ...session, runner };
    }
    case 'finished':
      return session;
  }
}

/**
 * Finalises a card whose runner has reached `next`: records its final event,
 * stores the next card state, updates response times and stats, re-queues the
 * card at the back of the queue when it is due again within the learn-ahead
 * window, then picks the next card or finishes the session.
 */
function finalizeCard(
  session: SessionState,
  runner: Extract<RunnerState, { state: 'next' }>,
  deps: SessionDeps
): SessionState {
  const event = runner.event;
  const kind = runner.card.kind;

  // The event is final: any Easy amend is already applied to it.
  const events = [...session.events, event];
  const wasNew = !session.cardStates.has(runner.card.id);
  const cardStates = new Map(session.cardStates).set(runner.card.id, runner.next);

  const responseMs = {
    ...session.responseMs,
    [kind]: [...(session.responseMs[kind] ?? []), event.responseMs],
  };
  const stats = {
    presented: session.stats.presented + 1,
    correct: session.stats.correct + (event.correct ? 1 : 0),
    newIntroduced: session.stats.newIntroduced + (wasNew ? 1 : 0),
  };

  // The reviewed card leaves the queue. It comes back at a later position
  // (the back, never the front) only when due again within learnAheadMs.
  const now = deps.now();
  const learnAheadMs = deps.learnAheadMs ?? LEARN_AHEAD_MS;
  const dueMs = Date.parse(runner.next.due);
  let queue = session.queue.filter((item) => item.card.id !== runner.card.id);
  if (dueMs <= now.getTime() + learnAheadMs) {
    queue = [...queue, { card: runner.card, isNew: false }];
  }

  const nextCard = pickNext(queue, cardStates, deps.now);
  if (nextCard) {
    return {
      ...session,
      status: 'running',
      queue,
      cardStates,
      events,
      responseMs,
      stats,
      runner: present(nextCard, cardStates, responseMs, deps),
    };
  }
  return {
    ...session,
    status: 'finished',
    queue,
    cardStates,
    events,
    responseMs,
    stats,
    runner: null,
  };
}

/**
 * The event in progress during feedback (not final: Easy may still amend it).
 */
export function draftEvent(session: SessionState): ReviewEventIn | null {
  return session.runner?.state === 'feedback' ? session.runner.event : null;
}

/**
 * Picks the next card to present: a due card in queue order (a card with no
 * state yet counts as due), falling back to the soonest card when nothing is
 * due yet. Returns `undefined` when the queue is empty.
 */
function pickNext(
  queue: readonly QueueItem[],
  cardStates: ReadonlyMap<string, CardState>,
  now: () => Date
): CardDto | undefined {
  if (queue.length === 0) return undefined;
  const nowMs = now().getTime();
  // A due card in queue order; a card with no state yet counts as due.
  for (const item of queue) {
    const state = cardStates.get(item.card.id);
    if (!state || Date.parse(state.due) <= nowMs) return item.card;
  }
  // Nothing due yet: present the soonest card so the session keeps going.
  const soonest = [...queue].sort(
    (a, b) =>
      Date.parse(cardStates.get(a.card.id)?.due ?? '') -
      Date.parse(cardStates.get(b.card.id)?.due ?? '')
  )[0];
  return soonest?.card;
}

function median(numbers: readonly number[]): number | null {
  if (numbers.length === 0) return null;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const midVal = sorted[mid];
  const prevVal = sorted[mid - 1];

  if (midVal === undefined) return null;

  return sorted.length % 2 !== 0 ? midVal : prevVal !== undefined ? (prevVal + midVal) / 2 : null;
}

export function summarize(session: SessionState): SessionSummary {
  const { presented, correct, newIntroduced } = session.stats;
  return {
    cardsReviewed: presented,
    accuracy: presented === 0 ? 0 : correct / presented,
    newCardsIntroduced: newIntroduced,
    events: session.events,
  };
}
