import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../random/rng.js';
import {
  MAX_RANK_DISTANCE,
  pickMeaningChoices,
  pickReadingChoices,
  type ReadingItem,
} from './choices.js';
import {
  TARGET,
  distractorsOf,
  glossesOverlap,
  ids,
  item,
  kanjiItem,
  poolAtDistance,
  poolOf,
} from './choice-fixtures.js';

type Picker = (
  target: ReadingItem,
  pool: readonly ReadingItem[],
  rng: () => number
) => ReadingItem[];
const pickers: [string, Picker][] = [
  ['pickMeaningChoices', pickMeaningChoices],
  ['pickReadingChoices', pickReadingChoices],
] as const;

afterEach(() => vi.restoreAllMocks());

describe.each(pickers)('%s: shared constraints', (_name, pick) => {
  const rng = () => createRng(42);

  it('returns the target plus 3 distinct distractors', () => {
    const choices = pick(TARGET, poolOf(20), rng());
    expect(choices).toHaveLength(4);
    expect(new Set(ids(choices)).size).toBe(4);
    expect(ids(choices).filter((id) => id === TARGET.id)).toHaveLength(1);
  });

  it('never offers the target twice when the pool contains it', () => {
    const choices = pick(TARGET, [TARGET, ...poolOf(10)], rng());
    expect(ids(choices).filter((id) => id === TARGET.id)).toHaveLength(1);
  });

  it('only uses distractors with the same part of speech', () => {
    const pool = [...poolOf(10), ...poolOf(10, (n) => ({ id: `verb-${n}`, pos: 'verb' }))];
    for (const d of distractorsOf(pick(TARGET, pool, rng()))) expect(d.pos).toBe('noun');
  });

  it(`keeps distractors within ${MAX_RANK_DISTANCE} ranks (inclusive)`, () => {
    const pool = [
      ...poolAtDistance(MAX_RANK_DISTANCE, 3, 'in'),
      ...poolAtDistance(MAX_RANK_DISTANCE + 1, 10, 'out'),
    ];
    const distractors = distractorsOf(pick(TARGET, pool, rng()));
    expect(distractors).toHaveLength(3);
    for (const d of distractors) expect(d.id).toMatch(/^in-/);
  });

  it('counts distance on both sides of the target rank', () => {
    const pool = [
      ...poolAtDistance(-MAX_RANK_DISTANCE, 2, 'below'),
      ...poolAtDistance(MAX_RANK_DISTANCE, 1, 'above'),
      ...poolAtDistance(5000, 10, 'far'),
    ];
    for (const d of distractorsOf(pick(TARGET, pool, rng()))) expect(d.id).not.toMatch(/^far-/);
  });

  describe('determinism', () => {
    it('same seed → same choices in the same order', () => {
      const pool = poolOf(20);
      expect(ids(pick(TARGET, pool, createRng(7)))).toEqual(ids(pick(TARGET, pool, createRng(7))));
    });

    it('different seeds → varied distractors and varied target position', () => {
      const pool = poolOf(20);
      const results = Array.from({ length: 30 }, (_, seed) => pick(TARGET, pool, createRng(seed)));
      expect(new Set(results.map((r) => ids(r).join())).size).toBeGreaterThan(5);
      expect(new Set(results.map((r) => ids(r).indexOf(TARGET.id))).size).toBeGreaterThan(1);
    });

    it('does not mutate the pool or the target', () => {
      const pool = poolOf(20);
      const poolCopy = structuredClone(pool);
      const targetCopy = structuredClone(TARGET);
      pick(TARGET, pool, rng());
      expect(pool).toEqual(poolCopy);
      expect(TARGET).toEqual(targetCopy);
    });
  });

  describe('fallback (never throws)', () => {
    it('widens the rank window before dropping the part-of-speech rule', () => {
      const pool = [
        ...poolAtDistance(10, 1, 'near-noun'),
        ...poolAtDistance(600, 5, 'wide-noun'),
        ...poolAtDistance(10, 5, 'near-verb', { pos: 'verb' }),
      ];
      const choices = pick(TARGET, pool, rng());
      expect(choices).toHaveLength(4);
      for (const d of distractorsOf(choices)) expect(d.pos).toBe('noun');
    });

    it('drops the part-of-speech rule only when same-POS candidates run out', () => {
      const pool = [
        ...poolAtDistance(10, 2, 'noun'),
        ...poolAtDistance(10, 5, 'verb', { pos: 'verb' }),
      ];
      const choices = pick(TARGET, pool, rng());
      expect(choices).toHaveLength(4);
      expect(ids(choices)).toEqual(expect.arrayContaining(['noun-0', 'noun-1']));
    });

    it.each([
      { name: 'empty pool', pool: [], length: 1 },
      { name: 'pool containing only the target', pool: [TARGET], length: 1 },
      { name: 'one candidate', pool: poolOf(1), length: 2 },
      { name: 'two candidates', pool: poolOf(2), length: 3 },
      { name: 'every candidate far away', pool: poolAtDistance(50_000, 6, 'far'), length: 4 },
      {
        name: 'every candidate a different POS',
        pool: poolOf(6, (n) => ({ id: `v-${n}`, pos: 'verb' })),
        length: 4,
      },
    ])('$name → $length choices, target included', ({ pool, length }) => {
      const choices = pick(TARGET, pool, createRng(1));
      expect(ids(choices)).toContain(TARGET.id);
      expect(choices).toHaveLength(length);
    });
  });

  describe('purity', () => {
    it('does not touch Math.random or Date.now', () => {
      vi.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random called');
      });
      vi.spyOn(Date, 'now').mockImplementation(() => {
        throw new Error('Date.now called');
      });
      expect(() => pick(TARGET, poolOf(20), rng())).not.toThrow();
    });
  });
});

describe('pickMeaningChoices: gloss rule', () => {
  const rng = () => createRng(3);

  it('excludes a candidate whose gloss matches the target, ignoring case', () => {
    const clash = item(50, { id: 'clash', gloss: ['WATER'] });
    const choices = pickMeaningChoices(TARGET, [clash, ...poolOf(10)], rng());
    expect(ids(choices)).not.toContain('clash');
  });

  it('excludes a candidate when ANY gloss in either list overlaps', () => {
    const target = item(0, { gloss: ['water', 'fluid'] });
    const clash = item(50, { id: 'clash', gloss: ['liquid', 'Fluid'] });
    expect(ids(pickMeaningChoices(target, [clash, ...poolOf(10)], rng()))).not.toContain('clash');
  });

  it('keeps distractors from overlapping each other either', () => {
    const pool = [
      item(1, { gloss: ['cold'] }),
      item(2, { gloss: ['Cold', 'chilly'] }),
      item(3, { gloss: ['chilly'] }),
      ...poolOf(10).slice(3),
    ];
    const distractors = distractorsOf(pickMeaningChoices(TARGET, pool, rng()));
    for (const a of distractors)
      for (const b of distractors) if (a !== b) expect(glossesOverlap(a, b)).toBe(false);
  });

  it('never relaxes the gloss rule in the fallback', () => {
    const pool = [...poolAtDistance(10, 8, 'clash', { gloss: ['water'] }), ...poolOf(1)];
    const choices = pickMeaningChoices(TARGET, pool, rng());
    expect(ids(choices).some((id) => id.startsWith('clash-'))).toBe(false);
  });

  it('skips the part-of-speech rule for kanji (no pos)', () => {
    const target = kanjiItem(0, { gloss: ['water'] });
    const pool = Array.from({ length: 10 }, (_, i) => kanjiItem(i + 1));
    const choices = pickMeaningChoices(target, pool, rng());
    expect(choices).toHaveLength(4);
  });
});

describe('pickReadingChoices: reading rule', () => {
  const rng = () => createRng(3);

  it("never offers a reading equal to the target's, even for a different word", () => {
    const homophone = item(50, { id: 'homophone', reading: TARGET.reading });
    const choices = pickReadingChoices(TARGET, [homophone, ...poolOf(10)], rng());
    expect(ids(choices)).not.toContain('homophone');
  });

  it('never offers two choices with the same reading', () => {
    const pool = [
      item(1, { reading: 'あ' }),
      item(2, { reading: 'あ' }),
      item(3, { reading: 'い' }),
      item(4, { reading: 'う' }),
      item(5, { reading: 'え' }),
    ];
    const readings = pickReadingChoices(TARGET, pool, rng()).map((c) => c.reading);
    expect(new Set(readings).size).toBe(readings.length);
  });

  it('never relaxes the reading rule in the fallback', () => {
    const pool = poolAtDistance(10, 8, 'homophone', { reading: TARGET.reading });
    const choices = pickReadingChoices(TARGET, pool, rng());
    expect(ids(choices).some((id) => id.startsWith('homophone-'))).toBe(false);
  });
});
