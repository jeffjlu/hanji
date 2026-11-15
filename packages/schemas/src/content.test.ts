import { describe, expect, it } from 'vitest';
import {
  entryDtoSchema,
  kanjiDtoSchema,
  cardDtoSchema,
  unitDtoSchema,
  unitContentSchema,
  manifestSchema,
} from './content.js';

const baseEntry = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  script: 'kanji',
  reading: 'かんじ',
  gloss: ['a character'],
  pos: 'noun',
  freqRank: 5,
};

function makeEntry(overrides: Record<string, unknown>) {
  return { ...baseEntry, ...overrides };
}

const baseKanji = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  glyph: '字',
  onReadings: ['ジ'],
  kunReadings: ['あざ'],
  gloss: ['character'],
  freqRank: 3,
};

function makeKanji(overrides: Record<string, unknown>) {
  return { ...baseKanji, ...overrides };
}

const baseUnit = {
  id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  slug: 'unit-1',
  title: 'Unit One',
  position: 0,
};

function makeUnit(overrides: Record<string, unknown>) {
  return { ...baseUnit, ...overrides };
}

function makeCard(kind: 'recognition' | 'kanji' = 'recognition') {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    kind,
    position: 0,
    entry: kind === 'recognition' ? makeEntry({}) : null,
    kanji: kind === 'kanji' ? makeKanji({}) : null,
  };
}

describe('entryDtoSchema', () => {
  const validCases = [{ name: 'valid entry', input: makeEntry({}) }];

  const invalidCases = [
    { name: 'invalid id rejected', input: makeEntry({ id: 'not-a-uuid' }), path: 'id' },
    { name: 'missing script rejected', input: makeEntry({ script: undefined }), path: 'script' },
    { name: 'empty script rejected', input: makeEntry({ script: '' }), path: 'script' },
    { name: 'empty reading rejected', input: makeEntry({ reading: '' }), path: 'reading' },
    { name: 'empty gloss rejected', input: makeEntry({ gloss: [] }), path: 'gloss' },
    { name: 'missing gloss rejected', input: makeEntry({ gloss: undefined }), path: 'gloss' },
    { name: 'empty pos rejected', input: makeEntry({ pos: '' }), path: 'pos' },
    { name: 'negative freqRank rejected', input: makeEntry({ freqRank: -1 }), path: 'freqRank' },
    { name: 'fractional freqRank rejected', input: makeEntry({ freqRank: 2.5 }), path: 'freqRank' },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(entryDtoSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = entryDtoSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('kanjiDtoSchema', () => {
  const validCases = [
    { name: 'valid kanji', input: makeKanji({}) },
    { name: 'empty readings accepted', input: makeKanji({ onReadings: [], kunReadings: [] }) },
  ];

  const invalidCases = [
    { name: 'invalid id rejected', input: makeKanji({ id: 'not-a-uuid' }), path: 'id' },
    { name: 'empty glyph rejected', input: makeKanji({ glyph: '' }), path: 'glyph' },
    { name: 'empty gloss rejected', input: makeKanji({ gloss: [] }), path: 'gloss' },
    { name: 'negative freqRank rejected', input: makeKanji({ freqRank: -1 }), path: 'freqRank' },
    { name: 'fractional freqRank rejected', input: makeKanji({ freqRank: 2.5 }), path: 'freqRank' },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(kanjiDtoSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = kanjiDtoSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('cardDtoSchema', () => {
  const validCases = [
    { name: 'card with entry accepted', input: makeCard('recognition') },
    { name: 'card with kanji accepted', input: makeCard('kanji') },
  ];

  const invalidCases = [
    {
      name: 'card with both entry and kanji rejected',
      input: { ...makeCard('recognition'), kanji: makeKanji({}) },
      path: undefined,
    },
    {
      name: 'card with neither entry nor kanji rejected',
      input: { ...makeCard('recognition'), entry: null, kanji: null },
      path: undefined,
    },
    { name: 'invalid kind rejected', input: { ...makeCard(), kind: 'flashcard' }, path: 'kind' },
    {
      name: 'negative position rejected',
      input: { ...makeCard(), position: -1 },
      path: 'position',
    },
    {
      name: 'fractional position rejected',
      input: { ...makeCard(), position: 1.5 },
      path: 'position',
    },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(cardDtoSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = cardDtoSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('unitDtoSchema', () => {
  const validCases = [{ name: 'valid unit', input: makeUnit({}) }];

  const invalidCases = [
    { name: 'invalid id rejected', input: makeUnit({ id: 'not-a-uuid' }), path: 'id' },
    { name: 'empty slug rejected', input: makeUnit({ slug: '' }), path: 'slug' },
    { name: 'empty title rejected', input: makeUnit({ title: '' }), path: 'title' },
    { name: 'negative position rejected', input: makeUnit({ position: -1 }), path: 'position' },
    { name: 'fractional position rejected', input: makeUnit({ position: 1.5 }), path: 'position' },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(unitDtoSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = unitDtoSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});

describe('unitContentSchema', () => {
  it('accepts a unit with cards', () => {
    const input = { unit: makeUnit({}), cards: [makeCard('recognition'), makeCard('kanji')] };
    expect(unitContentSchema.safeParse(input).success).toBe(true);
  });

  it('rejects an invalid card', () => {
    const input = {
      unit: makeUnit({}),
      cards: [{ ...makeCard(), entry: null, kanji: null }],
    };
    const result = unitContentSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('cards');
  });

  it('rejects a missing unit', () => {
    const result = unitContentSchema.safeParse({ cards: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('unit');
  });
});

describe('manifestSchema', () => {
  const validCases = [
    {
      name: 'valid manifest',
      input: { contentVersion: '2024-06-01', units: [{ ...makeUnit({}), cardCount: 2 }] },
    },
  ];

  const invalidCases = [
    { name: 'missing contentVersion rejected', input: { units: [] }, path: 'contentVersion' },
    {
      name: 'negative cardCount rejected',
      input: { contentVersion: '1', units: [{ ...makeUnit({}), cardCount: -1 }] },
      path: 'units',
    },
    {
      name: 'fractional cardCount rejected',
      input: { contentVersion: '1', units: [{ ...makeUnit({}), cardCount: 1.5 }] },
      path: 'units',
    },
  ];

  it.each(validCases)('accepts $name', ({ input }) => {
    expect(manifestSchema.safeParse(input).success).toBe(true);
  });

  it.each(invalidCases)('rejects $name', ({ input, path }) => {
    const result = manifestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(path);
  });
});
