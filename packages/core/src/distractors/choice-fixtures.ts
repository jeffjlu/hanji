import type { MeaningItem, ReadingItem } from './choices.js';

/** A noun at rank 1000 + n with a unique gloss and reading.*/
export const item = (n: number, overrides: Partial<ReadingItem> = {}): ReadingItem => ({
  id: `item-${n}`,
  reading: `よみ${n}`,
  gloss: [`gloss ${n}`],
  pos: 'noun',
  freqRank: 1000 + n,
  ...overrides,
});

/** Kanji have no part of speech. */
export const kanjiItem = (n: number, overrides: Partial<MeaningItem> = {}): MeaningItem => {
  const { pos: _pos, reading: _reading, ...rest } = item(n, overrides);
  return { ...rest, ...overrides };
};

/** The word under test: noun, rank 1000, gloss "water". */
export const TARGET = item(0, { gloss: ['water'], freqRank: 1000 });

/** `count` fully qualifying candidates (same POS, ranks 1001..1000+count, unique gloss/reading). */
export const poolOf = (count: number, tweak: (n: number) => Partial<ReadingItem> = () => ({})) =>
  Array.from({ length: count }, (_, i) => item(i + 1, tweak(i + 1)));

/** `count` candidates at an exact rank distance from TARGET, with unique ids/glosses. */
export const poolAtDistance = (
  distance: number,
  count: number,
  idPrefix: string,
  overrides: Partial<ReadingItem> = {}
) =>
  Array.from({ length: count }, (_, i) =>
    item(0, {
      id: `${idPrefix}-${i}`,
      reading: `${idPrefix}よみ${i}`,
      gloss: [`${idPrefix} gloss ${i}`],
      freqRank: TARGET.freqRank + distance,
      ...overrides,
    })
  );

export const ids = (items: readonly MeaningItem[]) => items.map((i) => i.id);

export const distractorsOf = (choices: readonly MeaningItem[], target: MeaningItem = TARGET) =>
  choices.filter((c) => c.id !== target.id);

export const glossSet = (i: MeaningItem) => new Set(i.gloss.map((g) => g.toLowerCase()));

export const glossesOverlap = (a: MeaningItem, b: MeaningItem) => {
  const setA = glossSet(a);
  return [...glossSet(b)].some((g) => setA.has(g));
};
