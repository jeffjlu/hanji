import { type ReviewEventIn } from '@hanji/schemas';
import { buildSchedulers } from './scheduler.js';
import { applyReview } from './apply-review.js';
import { type CardState } from './card-state.js';

export async function replayCard(events: readonly ReviewEventIn[]): Promise<CardState | null> {
  const sorted = dedupeAndSort(events);
  if (sorted.length === 0) return null;

  const cardId = sorted[0]!.cardId;
  if (sorted.some((e) => e.cardId !== cardId)) {
    throw new Error('replayCard received events for more than one card');
  }

  const schedulerLookup = await buildSchedulers(sorted.map((event) => event.retention));
  let state: CardState | null = null;
  for (const event of sorted) {
    state = applyReview(state, event, schedulerLookup);
  }
  return state;
}

/**
 * Deduplicates events by ID and sorts them by review instant (then by id).
 * Exported so tests can reuse the exact ordering replayCard applies.
 */
export function dedupeAndSort(events: readonly ReviewEventIn[]): ReviewEventIn[] {
  return dedupe(events).sort(compareEvents);
}

/**
 * Returns deduplicates list of events by event IDs.
 */
function dedupe(events: readonly ReviewEventIn[]): ReviewEventIn[] {
  const byId = new Map<string, ReviewEventIn>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (existing === undefined) {
      byId.set(event.id, event);
    } else if (!isSameEvent(existing, event)) {
      throw new Error(`Conflicting events share id ${event.id}`);
    }
  }
  return [...byId.values()];
}

function isSameEvent(a: ReviewEventIn, b: ReviewEventIn): boolean {
  const sortKeys = (event: ReviewEventIn) =>
    Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b)));

  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

/**
 * Compares two events by epoch milliseconds, then by id as a tiebreaker.
 */
function compareEvents(a: ReviewEventIn, b: ReviewEventIn): number {
  const diff = Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
