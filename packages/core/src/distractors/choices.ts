import { shuffle } from '../random/rng.js';

export type MeaningItem = { id: string; gloss: string[]; freqRank: number; pos?: string }; // entry or kanji
export type ReadingItem = MeaningItem & { reading: string; pos: string }; // entry only

export const MAX_RANK_DISTANCE = 300;
export const NUM_DISTRACTORS = 3;

const TIERS: Tier[] = [
  { maxDistance: MAX_RANK_DISTANCE, requireSamePos: true },
  { maxDistance: MAX_RANK_DISTANCE * 2, requireSamePos: true },
  { maxDistance: MAX_RANK_DISTANCE * 4, requireSamePos: true },
  { maxDistance: MAX_RANK_DISTANCE * 8, requireSamePos: true },
  { maxDistance: Infinity, requireSamePos: false },
];

/**
 * Searches the pool for `NUM_DISTRACTORS` valid candidates and shuffle them
 * with target.
 *
 * If there are not enough candidates, widen the rank window in steps, then
 * drop the part of speech rule. If there are still not enough, fewer than
 * `NUM_DISTRACTORS` + 1 items may be returned.
 */
function pickChoices<T extends MeaningItem>(
  target: T,
  pool: readonly T[],
  rng: () => number,
  accepts: (candidate: T, chosen: readonly T[]) => boolean = () => true
): T[] {
  const ordered = shuffle(
    [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    rng
  );
  const distractors: T[] = [];

  for (const tier of TIERS) {
    for (const candidate of ordered) {
      if (distractors.length === NUM_DISTRACTORS) break;
      if (distractors.some((d) => d.id === candidate.id)) continue;
      if (!isCandidate(target, candidate, tier)) continue;
      if (distractors.some((d) => glossesOverlap(d, candidate))) continue;
      if (!accepts(candidate, distractors)) continue;
      distractors.push(candidate);
    }
    if (distractors.length === NUM_DISTRACTORS) break;
  }

  return shuffle([target, ...distractors], rng);
}

export const pickMeaningChoices = <T extends MeaningItem>(
  target: T,
  pool: readonly T[],
  rng: () => number
) => pickChoices(target, pool, rng);

export function pickReadingChoices<T extends ReadingItem>(
  target: T,
  pool: readonly T[],
  rng: () => number
): T[] {
  return pickChoices(
    target,
    pool,
    rng,
    (candidate, chosen) =>
      candidate.reading !== target.reading && !chosen.some((d) => d.reading === candidate.reading)
  );
}

const normalise = (g: string) => g.trim().toLowerCase();

function glossesOverlap(a: MeaningItem, b: MeaningItem): boolean {
  const seen = new Set(a.gloss.map(normalise));
  return b.gloss.some((g) => seen.has(normalise(g)));
}

type Tier = { maxDistance: number; requireSamePos: boolean };

/**
 * Returns true if target and choice have a freqRank within tier.maxDistance,
 * do not have overlapping glosses, and have the same part of speech (if applicable)
 */
function isCandidate<T extends MeaningItem>(target: T, choice: T, tier: Tier): boolean {
  return (
    choice.id !== target.id &&
    Math.abs(target.freqRank - choice.freqRank) <= tier.maxDistance &&
    !glossesOverlap(target, choice) &&
    (!tier.requireSamePos || target.pos === undefined || choice.pos === target.pos)
  );
}
