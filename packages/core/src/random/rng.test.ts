import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng, shuffle } from './rng.js';

const draw = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng());
};

afterEach(() => vi.restoreAllMocks());

describe('createRng', () => {
  it('same seed → same sequence', () => {
    expect(draw(42, 50)).toEqual(draw(42, 50));
  });

  it('different seeds → different sequences', () => {
    expect(draw(1, 20)).not.toEqual(draw(2, 20));
  });

  it('every value is in [0, 1)', () => {
    for (const v of draw(7, 2000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is not obviously degenerate (roughly centred, many distinct values)', () => {
    const values = draw(123, 2000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(new Set(values).size).toBeGreaterThan(1990);
  });

  it('never touches Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    expect(() => draw(5, 10)).not.toThrow();
  });
});

describe('shuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('returns a permutation of the input', () => {
    expect([...shuffle(items, createRng(1))].sort()).toEqual([...items].sort());
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    shuffle(items, createRng(1));
    expect(items).toEqual(copy);
  });

  it('same seed → same order', () => {
    expect(shuffle(items, createRng(9))).toEqual(shuffle(items, createRng(9)));
  });

  it('different seeds eventually give different orders', () => {
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => shuffle(items, createRng(seed)).join(''))
    );
    expect(orders.size).toBeGreaterThan(5);
  });

  it('every element can land in position 0 across seeds (loose uniformity check)', () => {
    const firsts = new Set(
      Array.from({ length: 200 }, (_, seed) => shuffle(items, createRng(seed))[0])
    );
    expect(firsts.size).toBe(items.length);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle(['x'], createRng(1))).toEqual(['x']);
  });
});
