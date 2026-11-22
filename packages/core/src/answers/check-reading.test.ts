// EXPECT THE LOANWORD GROUP TO FAIL FIRST: if wanakana turns ー into a literal "ー"
// instead of a vowel, add an explicit normalisation step (replace ー with the vowel
// of the preceding kana) on BOTH sides, then re-run.
import { describe, it, expect } from 'vitest';
import { checkReading } from './check-reading.js';

type Pair = [input: string, expected: string];

const accepted: Record<string, Pair[]> = {
  'exact kana': [
    ['すし', 'すし'],
    ['こおひい', 'こおひい'],
  ],
  'katakana input, hiragana expected': [
    ['スシ', 'すし'],
    ['コオヒイ', 'こおひい'],
  ],
  'hiragana input, katakana expected': [['すし', 'スシ']],
  'plain romaji': [
    ['sushi', 'すし'],
    ['kanji', 'かんじ'],
  ],
  'shi / si': [
    ['sushi', 'すし'],
    ['susi', 'すし'],
    ['shio', 'しお'],
    ['sio', 'しお'],
  ],
  'tsu / tu': [
    ['tsukue', 'つくえ'],
    ['tukue', 'つくえ'],
  ],
  'fu / hu': [
    ['fune', 'ふね'],
    ['hune', 'ふね'],
  ],
  'n / nn': [
    ['hon', 'ほん'],
    ['honn', 'ほん'],
    ['kanji', 'かんじ'],
    ['kannji', 'かんじ'],
  ],
  'long vowels: ou / ee / oo spelled out': [
    ['toukyou', 'とうきょう'],
    ['sensei', 'せんせい'],
    ['oosaka', 'おおさか'],
    ['onee', 'おねえ'],
  ],
  'small tsu doubling': [
    ['kippu', 'きっぷ'],
    ['gakkou', 'がっこう'],
    ['zasshi', 'ざっし'],
  ],
  'loanword with long-vowel mark (コーヒー)': [
    ['コーヒー', 'こおひい'],
    ['コーヒー', 'コーヒー'],
    ['こおひい', 'コーヒー'],
    ['koohii', 'コーヒー'],
    ['koohii', 'こおひい'],
    ['ko-hi-', 'コーヒー'],
  ],
  'case and whitespace (all whitespace stripped)': [
    [' sushi ', 'すし'],
    ['SUSHI', 'すし'],
    ['su shi', 'すし'],
    ['su\tshi\n', 'すし'],
    ['すし\u3000', 'すし'], // full-width space
    ['ko o hi i', 'こおひい'],
  ],
  'wo / o for を': [
    ['wo', 'を'],
    ['o', 'を'],
  ],
  'm / n before b/p (しんぶん)': [
    ['shinbun', 'しんぶん'],
    ['shimbun', 'しんぶん'],
    ['kanban', 'かんばん'],
    ['kamban', 'かんばん'],
    ['konbini', 'コンビニ'],
    ['kombini', 'コンビニ'],
  ],
};

const rejected: Record<string, Pair[]> = {
  empty: [
    ['', 'すし'],
    ['   ', 'すし'],
  ],
  'partial answers': [
    ['su', 'すし'],
    ['koohi', 'こおひい'],
    ['sushi', 'すしや'],
  ],
  'wrong answers': [
    ['sake', 'すし'],
    ['tabemasu', 'のむ'],
  ],
  'extra characters': [
    ['sushii', 'すし'],
    ['sushi!', 'すし'],
  ],
  'missing vowel length': [
    ['kohi', 'こおひい'],
    ['toukyo', 'とうきょう'],
  ],
  'missing small tsu': [
    ['kipu', 'きっぷ'],
    ['gakou', 'がっこう'],
  ],
  'kanji is not a reading': [['寿司', 'すし']],
  'long vowels: ou spelled with oo': [['tookyoo', 'とうきょう']],
};

describe('checkReading: accepts', () => {
  describe.each(Object.entries(accepted))('%s', (_group, pairs) => {
    it.each(pairs)('"%s" matches "%s"', (input, expected) => {
      expect(checkReading(input, expected)).toBe(true);
    });
  });
});

describe('checkReading: rejects', () => {
  describe.each(Object.entries(rejected))('%s', (_group, pairs) => {
    it.each(pairs)('"%s" does not match "%s"', (input, expected) => {
      expect(checkReading(input, expected)).toBe(false);
    });
  });
});

describe('checkReading: robustness', () => {
  it.each(['😀', 'a'.repeat(10_000), '\u0000', 'ー', '\n\n'])(
    'returns false (does not throw) for odd input %j',
    (input) => {
      expect(() => checkReading(input, 'すし')).not.toThrow();
      expect(checkReading(input, 'すし')).toBe(false);
    }
  );

  it('is symmetric in script: kana in either argument', () => {
    expect(checkReading('スシ', 'すし')).toBe(checkReading('すし', 'スシ'));
  });
});
