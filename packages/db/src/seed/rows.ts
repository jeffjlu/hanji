import { createHash } from 'node:crypto';
import { type card, type entry, type kanji, type unit } from '../schema/content.js';
import { CONTENT_ID_NAMESPACE, contentId, contentKeys } from './ids.js';
import { entryRef, type Seed, type SeedCard } from './schema.js';

export type SeedRows = {
  units: (typeof unit.$inferInsert & { id: string })[];
  entries: (typeof entry.$inferInsert & { id: string })[];
  kanji: (typeof kanji.$inferInsert & { id: string })[];
  cards: (typeof card.$inferInsert & { id: string })[];
};

/** Maps a validated seed to database rows with deterministic ids. Pure. */
export function seedToRows(seed: Seed): SeedRows {
  const { language } = seed;
  const unitId = (slug: string) => contentId(contentKeys.unit(slug));
  const entryKey = (ref: string) => {
    const [script = '', reading = ''] = ref.split('|');
    return contentKeys.entry(language, script, reading);
  };
  const kanjiKey = (glyph: string) => contentKeys.kanji(language, glyph);
  const targetKey = (c: SeedCard) =>
    c.kanji !== undefined ? kanjiKey(c.kanji) : entryKey(c.entry!);

  return {
    units: seed.units.map((u) => ({
      id: unitId(u.slug),
      language,
      slug: u.slug,
      title: u.title,
      position: u.position,
    })),
    entries: seed.entries.map((e) => ({
      id: contentId(entryKey(entryRef(e))),
      script: e.script,
      reading: e.reading,
      gloss: e.gloss,
      pos: e.pos,
      freqRank: e.freqRank,
      unitId: unitId(e.unit),
    })),
    kanji: seed.kanji.map((k) => ({
      id: contentId(kanjiKey(k.glyph)),
      glyph: k.glyph,
      onReadings: k.onReadings,
      kunReadings: k.kunReadings,
      gloss: k.gloss,
      freqRank: k.freqRank,
    })),
    cards: seed.cards.map((c) => ({
      id: contentId(contentKeys.card(c.kind, targetKey(c))),
      kind: c.kind,
      position: c.position,
      entryId: c.entry !== undefined ? contentId(entryKey(c.entry)) : null,
      kanjiId: c.kanji !== undefined ? contentId(kanjiKey(c.kanji)) : null,
      unitId: unitId(c.unit),
    })),
  };
}

const byKey =
  <T>(keyOf: (item: T) => string) =>
  (a: T, b: T) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };

/** JSON with object keys sorted at every level, so formatting and key order never matter. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The content version: SHA-256 of the canonical seed. Reordering the top-level
 * lists or reformatting the file gives the same hash; any change to a value
 * (including gloss order, which decides what the learner sees first) does not.
 * The id namespace is included because changing it changes every id.
 */
export function contentVersionHash(seed: Seed): string {
  const normalised = {
    idNamespace: CONTENT_ID_NAMESPACE,
    ...seed,
    sources: [...seed.sources].sort(byKey((s) => s.id)),
    units: [...seed.units].sort(byKey((u) => u.slug)),
    entries: [...seed.entries].sort(byKey(entryRef)),
    kanji: [...seed.kanji].sort(byKey((k) => k.glyph)),
    cards: [...seed.cards].sort(byKey((c) => `${c.kind}:${c.entry ?? ''}:${c.kanji ?? ''}`)),
  };
  return createHash('sha256').update(canonicalJson(normalised), 'utf8').digest('hex');
}
