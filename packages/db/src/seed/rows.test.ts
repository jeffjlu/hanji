import { describe, expect, it } from 'vitest';
import { contentId, contentKeys } from './ids.js';
import { DEFAULT_SEED_FILE, readSeedFile } from './load.js';
import { canonicalJson, contentVersionHash, seedToRows } from './rows.js';

const seed = readSeedFile(DEFAULT_SEED_FILE);

describe('seedToRows', () => {
  const rows = seedToRows(seed);

  it('derives every id from its natural key', () => {
    const water = rows.entries.find((e) => e.script === '水')!;
    expect(water.id).toBe(contentId(contentKeys.entry('ja', '水', 'みず')));
    expect(water.unitId).toBe(contentId(contentKeys.unit('food-and-drink')));

    const recognition = rows.cards.find((c) => c.kind === 'recognition' && c.entryId === water.id)!;
    expect(recognition.id).toBe(
      contentId(contentKeys.card('recognition', contentKeys.entry('ja', '水', 'みず')))
    );
    expect(recognition.kanjiId).toBeNull();
  });

  it('gives each card exactly one existing target', () => {
    const entryIds = new Set(rows.entries.map((e) => e.id));
    const kanjiIds = new Set(rows.kanji.map((k) => k.id));
    for (const c of rows.cards) {
      expect((c.entryId === null) !== (c.kanjiId === null)).toBe(true);
      if (c.entryId) expect(entryIds.has(c.entryId)).toBe(true);
      if (c.kanjiId) expect(kanjiIds.has(c.kanjiId)).toBe(true);
    }
  });

  it('produces unique ids across all tables', () => {
    const all = [...rows.units, ...rows.entries, ...rows.kanji, ...rows.cards].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the word and the kanji 水 apart', () => {
    const word = rows.entries.find((e) => e.script === '水')!;
    const glyph = rows.kanji.find((k) => k.glyph === '水')!;
    expect(word.id).not.toBe(glyph.id);
  });
});

describe('contentVersionHash', () => {
  const hash = contentVersionHash(seed);

  it('is a SHA-256 hex digest', () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores the order of top-level lists and of object keys', () => {
    const shuffled = {
      ...seed,
      entries: [...seed.entries].reverse(),
      cards: [...seed.cards].reverse(),
      kanji: seed.kanji.map((k) =>
        Object.fromEntries(Object.entries(k).reverse())
      ) as typeof seed.kanji,
    };
    expect(contentVersionHash(shuffled)).toBe(hash);
  });

  it('changes when a gloss changes, or when gloss order changes', () => {
    const edited = structuredClone(seed);
    edited.entries[0]!.gloss = ['drinking water'];
    expect(contentVersionHash(edited)).not.toBe(hash);

    const reordered = structuredClone(seed);
    const tea = reordered.entries.find((e) => e.script === 'お茶')!;
    tea.gloss.reverse();
    expect(contentVersionHash(reordered)).not.toBe(hash);
  });
});

describe('canonicalJson', () => {
  it('sorts keys at every level and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"e":0,"f":1}]},"b":1}'
    );
  });
});
