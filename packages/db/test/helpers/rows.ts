import { id } from '../../src/testing/ids.js';

export const unitRow = (n: number, o: Record<string, unknown> = {}) => ({
  id: id(n),
  slug: `unit-${n}`,
  title: `Unit ${n}`,
  position: n,
  ...o,
});

export const entryRow = (n: number, unitId: string, o: Record<string, unknown> = {}) => ({
  id: id(100 + n),
  script: `語${n}`,
  reading: 'ご',
  gloss: ['word'],
  pos: 'noun',
  freqRank: n,
  unitId,
  ...o,
});

export const kanjiRow = (n: number, o: Record<string, unknown> = {}) => ({
  id: id(200 + n),
  glyph: String.fromCodePoint(0x4e00 + n),
  onReadings: ['スイ'],
  kunReadings: ['みず'],
  gloss: ['water'],
  freqRank: n,
  ...o,
});

export const cardRow = (
  n: number,
  unitId: string,
  o: {
    kind?: 'recognition' | 'production' | 'kanji';
    entryId?: string | null;
    kanjiId?: string | null;
    position?: number;
  } = {}
) => ({
  id: id(300 + n),
  kind: 'recognition' as const,
  position: n,
  unitId,
  entryId: null,
  kanjiId: null,
  ...o,
});
