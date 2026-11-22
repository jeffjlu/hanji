import { type CardDto } from '@hanji/schemas';
import { type CardState } from '../fsrs/card-state.js';
import { localDay } from '../time/local-day.js';
import { createRng, shuffle } from '../random/rng.js';

export const MAX_OVERDUE_CARDS = 100;

export type BuildSessionInput = {
  now: Date;
  tz: string;
  seed: number;
  content: CardDto[];
  userCards: CardState[];
  newPerDay: number;
  newCardOrder?: (a: CardDto, b: CardDto) => number;
};

export type BuildSessionOutput = {
  queue: { cardId: string; isNew: boolean }[];
  counts: { due: number; newCards: number; introducedToday: number };
  blockedReason: 'backlog' | 'cap' | null;
};

/**
 * Builds a review session: due reviews plus a capped set of new cards, shuffled together.
 *
 * Due reviews are user cards not in the `New` state whose `due` is at or
 * before `now`. New cards come from `content` (cards without user state),
 * ordered by `newCardOrder` (default: global frequency rank, then card
 * position, with an optional override for Phase 4's Travel mode), and are
 * capped at `newPerDay` minus cards already introduced today. When more than
 * `MAX_OVERDUE_CARDS` reviews are due strictly before `now`, the backlog
 * guard trips and no new cards are offered. Production cards are eligible
 * only once their word's recognition card has `correctReps > 0`, evaluated
 * at build time so a same-session unlock waits for the next session.
 *
 * @param input - `now`, `tz`, `seed`, `content`, `userCards`, `newPerDay`,
 *   and an optional `newCardOrder` comparator.
 * @returns The RNG-shuffled queue (no card appears twice), counts, and a
 *   `blockedReason` of `'backlog'` or `'cap'` when no new cards are offered.
 */
export function buildSession(input: BuildSessionInput): BuildSessionOutput {
  const nowMs = input.now.getTime();
  const reviewed = input.userCards.filter((c) => c.state !== 'New');

  const due = reviewed.filter((c) => Date.parse(c.due) <= nowMs);
  const overdue = reviewed.filter((c) => Date.parse(c.due) < nowMs).length;
  const backlog = overdue > MAX_OVERDUE_CARDS;

  const today = localDay(input.now, input.tz);
  const introducedToday = input.userCards.filter(
    (c) => localDay(new Date(c.firstReview), input.tz) === today
  ).length;
  const cap = Math.max(0, input.newPerDay - introducedToday);

  const candidates = newCandidates(input.content, input.userCards);
  const order = input.newCardOrder ?? byFrequency;
  const newCards = backlog ? [] : candidates.toSorted(order).slice(0, cap);

  let blockedReason: BuildSessionOutput['blockedReason'] = null;
  if (backlog) blockedReason = 'backlog';
  else if (cap === 0 && candidates.length > 0) blockedReason = 'cap';

  const items = [
    ...due.map((c) => ({ cardId: c.cardId, isNew: false })),
    ...newCards.map((c) => ({ cardId: c.id, isNew: true })),
  ];

  return {
    queue: shuffle(items, createRng(input.seed)),
    counts: { due: due.length, newCards: newCards.length, introducedToday },
    blockedReason,
  };
}

/**
 * Returns content cards eligible to be offered as new cards, excluding any
 * card the user already has state for. Production cards are included only
 * when their word's recognition card has `correctReps > 0`; eligibility is
 * evaluated when the session is built, so a same-session unlock waits for
 * the next session.
 */
function newCandidates(content: CardDto[], userCards: CardState[]): CardDto[] {
  const byCardId = new Map(userCards.map((c) => [c.cardId, c]));
  const recognitionByEntry = new Map(
    content.filter((c) => c.kind === 'recognition' && c.entry).map((c) => [c.entry!.id, c.id])
  );
  return content.filter((card) => {
    if (byCardId.has(card.id)) return false;
    if (card.kind !== 'production') return true;
    if (!card.entry) return false;
    const recId = card.entry && recognitionByEntry.get(card.entry.id);
    return recId !== undefined && (byCardId.get(recId)?.correctReps ?? 0) > 0;
  });
}

/**
 * Returns a card's global frequency rank from its entry or kanji, throwing
 * if neither carries one.
 */
function freqRank(card: CardDto): number {
  const rank = card.entry?.freqRank ?? card.kanji?.freqRank;
  if (rank === undefined) throw new Error(`Card ${card.id} has neither entry nor kanji`);
  return rank;
}

/**
 * Orders new cards by global frequency rank, then card position, then id as
 * a final tiebreak. Pass a custom `newCardOrder` to replace this (Travel
 * mode uses unit order, then frequency within a unit).
 */
function byFrequency(a: CardDto, b: CardDto): number {
  return freqRank(a) - freqRank(b) || a.position - b.position || compareIds(a.id, b.id);
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
