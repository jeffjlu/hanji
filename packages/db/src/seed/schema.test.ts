import { describe, expect, it } from 'vitest';
import { parseSeed, type Seed, SeedValidationError } from './schema.js';

/** A minimal valid seed: one word with both card kinds, one kanji. */
const base = (): Seed => ({
  format: 'hanji-seed/1',
  language: 'ja',
  sources: [{ id: 'hand-written', kind: 'hand-written', author: 'Test', description: 'Test seed' }],
  units: [{ slug: 'u1', title: 'Unit 1', position: 1 }],
  entries: [
    {
      script: '水',
      reading: 'みず',
      gloss: ['water'],
      pos: 'noun',
      freqRank: 1,
      unit: 'u1',
      source: 'hand-written',
    },
  ],
  kanji: [
    {
      glyph: '水',
      onReadings: ['スイ'],
      kunReadings: ['みず'],
      gloss: ['water'],
      freqRank: 1,
      source: 'hand-written',
    },
  ],
  cards: [
    { kind: 'recognition', entry: '水|みず', unit: 'u1', position: 1 },
    { kind: 'production', entry: '水|みず', unit: 'u1', position: 2 },
    { kind: 'kanji', kanji: '水', unit: 'u1', position: 3 },
  ],
});

/** Returns the problem list, failing the test if the seed is valid. */
function problemsOf(mutate: (seed: Record<string, unknown> & Seed) => void): string[] {
  const seed = structuredClone(base()) as Record<string, unknown> & Seed;
  mutate(seed);
  try {
    parseSeed(seed);
  } catch (err) {
    expect(err).toBeInstanceOf(SeedValidationError);
    return (err as SeedValidationError).problems;
  }
  throw new Error('expected the seed to be invalid');
}

describe('parseSeed', () => {
  it('accepts a valid seed', () => {
    expect(parseSeed(base())).toEqual(base());
  });

  it.each<{ name: string; mutate: (s: Record<string, unknown> & Seed) => void; problem: RegExp }>([
    {
      name: 'a card with both entry and kanji',
      mutate: (s) => (s.cards[2]!.entry = '水|みず'),
      problem: /^cards\[2\]: must reference exactly one of entry or kanji$/,
    },
    {
      name: 'a card with neither entry nor kanji',
      mutate: (s) => delete s.cards[0]!.entry,
      problem: /^cards\[0\]: must reference exactly one/,
    },
    {
      name: 'a missing field',
      mutate: (s) => delete (s.entries[0] as Partial<Seed['entries'][number]>).gloss,
      problem: /^entries\[0\]\.gloss: /,
    },
    {
      name: 'a missing top-level list',
      mutate: (s) => delete (s as Partial<Seed>).cards,
      problem: /^cards: /,
    },
    {
      name: 'an unknown key (typo)',
      mutate: (s) => ((s.entries[0] as Record<string, unknown>)['glosses'] = ['x']),
      problem: /^entries\[0\]: .*glosses/,
    },
    {
      name: 'the wrong format version',
      mutate: (s) => ((s as Record<string, unknown>)['format'] = 'hanji-seed/2'),
      problem: /^format: /,
    },
    {
      name: 'a kanji card pointing at an entry',
      mutate: (s) => {
        delete s.cards[2]!.kanji;
        s.cards[2]!.entry = '水|みず';
      },
      problem: /^cards\[2\]\.kind: a kanji card must reference a kanji/,
    },
    {
      name: 'a recognition card pointing at a kanji',
      mutate: (s) => {
        delete s.cards[0]!.entry;
        s.cards[0]!.kanji = '水';
      },
      problem: /^cards\[0\]\.kind: a recognition card must reference an entry/,
    },
    {
      name: 'a card for an unknown entry',
      mutate: (s) => (s.cards[0]!.entry = '火|ひ'),
      problem: /^cards\[0\]\.entry: unknown entry "火\|ひ"/,
    },
    {
      name: 'a card for an unknown kanji',
      mutate: (s) => (s.cards[2]!.kanji = '火'),
      problem: /^cards\[2\]\.kanji: unknown kanji/,
    },
    {
      name: 'a card in an unknown unit',
      mutate: (s) => (s.cards[0]!.unit = 'nowhere'),
      problem: /^cards\[0\]\.unit: unknown unit/,
    },
    {
      name: 'a production card without a recognition card',
      mutate: (s) => (s.cards[0]!.kind = 'production'),
      problem: /production card for "水\|みず" has no recognition card/,
    },
    {
      name: 'two cards at one position',
      mutate: (s) => (s.cards[1]!.position = 1),
      problem: /^cards\[1\]\.position: duplicates cards\[0\]/,
    },
    {
      name: 'two cards of one kind for one entry',
      mutate: (s) => (s.cards[1]!.kind = 'recognition'),
      problem: /^cards\[1\]\.kind: duplicates cards\[0\]/,
    },
    {
      name: 'a duplicate entry',
      mutate: (s) => s.entries.push({ ...s.entries[0]!, gloss: ['other'] }),
      problem: /^entries\[1\]\.script: duplicates entries\[0\]/,
    },
    {
      name: 'a duplicate unit position',
      mutate: (s) => s.units.push({ slug: 'u2', title: 'Unit 2', position: 1 }),
      problem: /^units\[1\]\.position: duplicates/,
    },
    {
      name: 'an entry with an unknown source',
      mutate: (s) => (s.entries[0]!.source = 'jmdict'),
      problem: /^entries\[0\]\.source: unknown source/,
    },
    {
      name: 'a reading in romaji',
      mutate: (s) => (s.entries[0]!.reading = 'mizu'),
      problem: /^entries\[0\]\.reading: must be written in kana/,
    },
    {
      name: 'an empty gloss list',
      mutate: (s) => (s.entries[0]!.gloss = []),
      problem: /^entries\[0\]\.gloss: needs at least one gloss/,
    },
    {
      name: 'duplicate glosses',
      mutate: (s) => (s.entries[0]!.gloss = ['water', 'Water']),
      problem: /^entries\[0\]\.gloss: glosses must be unique/,
    },
    {
      name: 'a gloss with stray whitespace',
      mutate: (s) => (s.entries[0]!.gloss = ['water ']),
      problem: /^entries\[0\]\.gloss\[0\]: must not start or end with whitespace/,
    },
    {
      name: 'a non-NFC script',
      mutate: (s) => (s.entries[0]!.script = 'が'), // decomposed が
      problem: /^entries\[0\]\.script: must be Unicode NFC/,
    },
    {
      name: 'an unknown part of speech',
      mutate: (s) => ((s.entries[0] as Record<string, unknown>)['pos'] = 'n'),
      problem: /^entries\[0\]\.pos: /,
    },
    {
      name: 'a zero frequency rank',
      mutate: (s) => (s.entries[0]!.freqRank = 0),
      problem: /^entries\[0\]\.freqRank: /,
    },
    {
      name: 'a two-character kanji glyph',
      mutate: (s) => (s.kanji[0]!.glyph = '水水'),
      problem: /^kanji\[0\]\.glyph: must be exactly one kanji/,
    },
    {
      name: 'on and kun readings swapped',
      mutate: (s) => {
        s.kanji[0]!.onReadings = ['みず'];
        s.kanji[0]!.kunReadings = ['スイ'];
      },
      problem: /^kanji\[0\]\.onReadings\[0\]: on readings must be katakana/,
    },
    {
      name: 'a kanji with no readings',
      mutate: (s) => {
        s.kanji[0]!.onReadings = [];
        s.kanji[0]!.kunReadings = [];
      },
      problem: /^kanji\[0\]\.onReadings: needs at least one on or kun reading/,
    },
  ])('rejects $name', ({ mutate, problem }) => {
    expect(problemsOf(mutate)).toContainEqual(expect.stringMatching(problem));
  });

  it('lists every problem at once, with a readable message', () => {
    let message = '';
    try {
      parseSeed(
        {
          ...base(),
          cards: [{ kind: 'recognition', entry: '火|ひ', unit: 'nowhere', position: 1 }],
        },
        'seed file x.json'
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/^Invalid seed file x\.json \(2 problems\):\n  - cards\[0\]\.unit/);
    expect(message).toContain('cards[0].entry: unknown entry');
  });

  it('accepts dataset sources with full licence metadata', () => {
    const seed = base();
    seed.sources.push({
      id: 'jmdict',
      kind: 'dataset',
      name: 'JMdict',
      version: '2027-01-01',
      date: '2027-01-01',
      licence: 'CC BY-SA 4.0',
      url: 'https://www.edrdg.org/edrdg/license.html',
      attribution: 'EDRDG',
    });
    expect(() => parseSeed(seed)).not.toThrow();
  });

  it('rejects a dataset source without its licence metadata', () => {
    const problems = problemsOf((s) =>
      (s.sources as unknown[]).push({ id: 'jmdict', kind: 'dataset', name: 'JMdict' })
    );
    expect(problems).toContainEqual(expect.stringMatching(/^sources\[1\]\.(version|date|licence)/));
  });
});
