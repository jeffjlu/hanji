/**
 * Checks the hand-written seed itself: the ticket's content requirements, and
 * the P1-06 distractor rules using core's own picker.
 */
import { describe, expect, it } from 'vitest';
import {
  createRng,
  MAX_RANK_DISTANCE,
  type MeaningItem,
  NUM_DISTRACTORS,
  pickMeaningChoices,
  pickReadingChoices,
  type ReadingItem,
} from '@hanji/core';
import { DEFAULT_SEED_FILE, readSeedFile } from './load.js';
import { seedToRows } from './rows.js';

const seed = readSeedFile(DEFAULT_SEED_FILE);
const rows = seedToRows(seed);

describe('hand-written seed', () => {
  it('has about 30 cards: 12 words with recognition and production, and 6 kanji', () => {
    expect(seed.cards).toHaveLength(30);
    expect(seed.entries).toHaveLength(12);
    expect(seed.entries.filter((e) => e.pos === 'noun')).toHaveLength(8);
    expect(seed.entries.filter((e) => e.pos === 'verb')).toHaveLength(4);
    expect(seed.kanji).toHaveLength(6);
    for (const e of seed.entries) {
      const kinds = seed.cards
        .filter((c) => c.entry === `${e.script}|${e.reading}`)
        .map((c) => c.kind);
      expect(kinds.sort()).toEqual(['production', 'recognition']);
    }
    expect(seed.cards.filter((c) => c.kind === 'kanji')).toHaveLength(6);
  });

  it('has no listening cards (audio arrives in Phase 3)', () => {
    expect(seed.cards.map((c) => c.kind)).not.toContain('listening');
  });

  it('includes a katakana loanword with the long-vowel mark', () => {
    expect(seed.entries).toContainEqual(
      expect.objectContaining({ script: 'コーヒー', reading: 'コーヒー' })
    );
  });

  it('includes a word with a long vowel spelled in kana', () => {
    expect(seed.entries.some((e) => /[おこそとのほもよろごぞどぼぽょ]う/.test(e.reading))).toBe(
      true
    );
  });

  it('marks every row as hand-written', () => {
    expect(seed.sources).toEqual([
      expect.objectContaining({ id: 'hand-written', kind: 'hand-written' }),
    ]);
    expect(new Set([...seed.entries, ...seed.kanji].map((r) => r.source))).toEqual(
      new Set(['hand-written'])
    );
  });
});

describe('distractors (P1-06 rules)', () => {
  const words: ReadingItem[] = rows.entries.map((e) => ({
    id: e.id,
    gloss: e.gloss,
    freqRank: e.freqRank,
    pos: e.pos,
    reading: e.reading,
  }));
  const kanji: MeaningItem[] = rows.kanji.map((k) => ({
    id: k.id,
    gloss: k.gloss,
    freqRank: k.freqRank,
  }));
  const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);
  const overlaps = (a: MeaningItem, b: MeaningItem) =>
    a.gloss.some((g) => b.gloss.map((x) => x.toLowerCase()).includes(g.toLowerCase()));

  /** Candidates that pass the strict rules, with no fallback widening. */
  const strictCandidates = (target: MeaningItem, pool: MeaningItem[]) =>
    pool.filter(
      (c) =>
        c.id !== target.id &&
        Math.abs(c.freqRank - target.freqRank) <= MAX_RANK_DISTANCE &&
        !overlaps(c, target) &&
        (target.pos === undefined || c.pos === target.pos)
    );

  it.each(words.map((w) => [rows.entries.find((e) => e.id === w.id)!.script, w] as const))(
    'word %s has at least three strictly eligible distractors',
    (_, target) => {
      expect(strictCandidates(target, words).length).toBeGreaterThanOrEqual(NUM_DISTRACTORS);
    }
  );

  it.each(kanji.map((k) => [rows.kanji.find((r) => r.id === k.id)!.glyph, k] as const))(
    'kanji %s has at least three strictly eligible distractors',
    (_, target) => {
      expect(strictCandidates(target, kanji).length).toBeGreaterThanOrEqual(NUM_DISTRACTORS);
    }
  );

  it('pickMeaningChoices never needs its fallback for any word or kanji', () => {
    for (const [pool, isKanji] of [
      [words, false],
      [kanji, true],
    ] as const) {
      for (const target of pool) {
        for (const s of SEEDS) {
          const choices = pickMeaningChoices<MeaningItem>(target, pool, createRng(s));
          expect(choices).toHaveLength(NUM_DISTRACTORS + 1);
          expect(choices.map((c) => c.id)).toContain(target.id);
          const distractors = choices.filter((c) => c.id !== target.id);
          for (const d of distractors) {
            expect(Math.abs(d.freqRank - target.freqRank)).toBeLessThanOrEqual(MAX_RANK_DISTANCE);
            expect(overlaps(d, target)).toBe(false);
            if (!isKanji) expect(d.pos).toBe(target.pos);
          }
          for (const [i, a] of distractors.entries()) {
            for (const b of distractors.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
          }
        }
      }
    }
  });

  it('pickReadingChoices gives four distinct readings for every word', () => {
    for (const target of words) {
      for (const s of SEEDS) {
        const choices = pickReadingChoices(target, words, createRng(s));
        expect(choices).toHaveLength(NUM_DISTRACTORS + 1);
        expect(new Set(choices.map((c) => c.reading)).size).toBe(NUM_DISTRACTORS + 1);
        for (const d of choices.filter((c) => c.id !== target.id)) expect(d.pos).toBe(target.pos);
      }
    }
  });
});
