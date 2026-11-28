import { z } from 'zod';
import { card } from '../schema/content.js';

/**
 * Seed file format. The hand-written Phase 1 seed and the Phase 3 pipeline's
 * `seed.json` both use it. Bump the version on any breaking change.
 *
 * The file holds natural keys, not ids. The loader derives every id with
 * UUID v5 (see ids.ts), so the pipeline (Python) never has to compute them.
 */
export const SEED_FORMAT = 'hanji-seed/1';

/** Coarse parts of speech. Distractors must share one, so keep the set small. */
export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'i-adjective',
  'na-adjective',
  'adverb',
  'expression',
] as const;

const CARD_KINDS = card.kind.enumValues;

const text = z
  .string()
  .min(1, 'must not be empty')
  .refine((s) => s.trim() === s, 'must not start or end with whitespace')
  .refine((s) => s.normalize('NFC') === s, 'must be Unicode NFC-normalised');

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lower-case kebab-case slug');

const unique = (items: readonly string[]) => new Set(items).size === items.length;

const glossList = z
  .array(text)
  .min(1, 'needs at least one gloss')
  .refine(
    (glosses) => unique(glosses.map((g) => g.toLowerCase())),
    'glosses must be unique (ignoring case)'
  );

const kana = text.regex(
  /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u,
  'must be written in kana only'
);
const onReading = text.regex(
  /^[\p{Script=Katakana}ー]+$/u,
  'on readings must be katakana (for example スイ)'
);
const kunReading = text.regex(
  /^-?[\p{Script=Hiragana}]+(\.[\p{Script=Hiragana}]+)?-?$/u,
  'kun readings must be hiragana, with "." before okurigana (for example た.べる)'
);

const rank = z.int().positive();
const position = z.int().nonnegative();

const sourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: slug,
    kind: z.literal('hand-written'),
    author: text,
    description: text,
  }),
  // For Phase 3. EDRDG requires distributed data to state its version and date.
  z.strictObject({
    id: slug,
    kind: z.literal('dataset'),
    name: text,
    version: text,
    date: z.iso.date(),
    licence: text,
    url: z.url(),
    attribution: text,
  }),
]);

const unitSchema = z.strictObject({ slug, title: text, position });

const entrySchema = z.strictObject({
  script: text,
  reading: kana,
  gloss: glossList,
  pos: z.enum(PARTS_OF_SPEECH),
  freqRank: rank,
  unit: slug,
  source: slug,
});

const kanjiSchema = z
  .strictObject({
    glyph: z.string().regex(/^\p{Script=Han}$/u, 'must be exactly one kanji'),
    onReadings: z.array(onReading),
    kunReadings: z.array(kunReading),
    gloss: glossList,
    freqRank: rank,
    source: slug,
  })
  .refine((k) => k.onReadings.length + k.kunReadings.length > 0, {
    message: 'needs at least one on or kun reading',
    path: ['onReadings'],
  });

const cardSchema = z.strictObject({
  kind: z.enum(CARD_KINDS),
  /** An entry's natural key, `script|reading`. */
  entry: z.string().optional(),
  /** A kanji glyph. */
  kanji: z.string().optional(),
  unit: slug,
  position,
});

export type SeedEntry = z.infer<typeof entrySchema>;
export type SeedCard = z.infer<typeof cardSchema>;

/** How cards refer to an entry. */
export const entryRef = (e: Pick<SeedEntry, 'script' | 'reading'>) => `${e.script}|${e.reading}`;

export const seedSchema = z
  .strictObject({
    format: z.literal(SEED_FORMAT),
    language: z.literal('ja'),
    sources: z.array(sourceSchema).min(1),
    units: z.array(unitSchema).min(1),
    entries: z.array(entrySchema),
    kanji: z.array(kanjiSchema),
    cards: z.array(cardSchema).min(1),
  })
  .superRefine((seed, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    const noDuplicates = <T>(
      collection: string,
      items: readonly T[],
      keyOf: (item: T) => string,
      field: string
    ) => {
      const seen = new Map<string, number>();
      items.forEach((item, i) => {
        const key = keyOf(item);
        const first = seen.get(key);
        if (first === undefined) seen.set(key, i);
        else issue([collection, i, field], `duplicates ${collection}[${first}] (${key})`);
      });
    };

    noDuplicates('sources', seed.sources, (s) => s.id, 'id');
    noDuplicates('units', seed.units, (u) => u.slug, 'slug');
    noDuplicates('units', seed.units, (u) => String(u.position), 'position');
    noDuplicates('entries', seed.entries, entryRef, 'script');
    noDuplicates('kanji', seed.kanji, (k) => k.glyph, 'glyph');
    noDuplicates('cards', seed.cards, (c) => `${c.unit} #${c.position}`, 'position');
    noDuplicates('cards', seed.cards, (c) => `${c.kind} ${c.entry ?? c.kanji}`, 'kind');

    const sources = new Set(seed.sources.map((s) => s.id));
    const units = new Set(seed.units.map((u) => u.slug));
    const entries = new Set(seed.entries.map(entryRef));
    const kanji = new Set(seed.kanji.map((k) => k.glyph));

    seed.entries.forEach((e, i) => {
      if (!units.has(e.unit)) issue(['entries', i, 'unit'], `unknown unit "${e.unit}"`);
      if (!sources.has(e.source)) issue(['entries', i, 'source'], `unknown source "${e.source}"`);
    });
    seed.kanji.forEach((k, i) => {
      if (!sources.has(k.source)) issue(['kanji', i, 'source'], `unknown source "${k.source}"`);
    });

    seed.cards.forEach((c, i) => {
      if (!units.has(c.unit)) issue(['cards', i, 'unit'], `unknown unit "${c.unit}"`);

      if ((c.entry === undefined) === (c.kanji === undefined)) {
        issue(['cards', i], 'must reference exactly one of entry or kanji');
        return;
      }
      if (c.kind === 'kanji' && c.kanji === undefined) {
        issue(['cards', i, 'kind'], 'a kanji card must reference a kanji, not an entry');
      } else if (c.kind !== 'kanji' && c.entry === undefined) {
        issue(['cards', i, 'kind'], `a ${c.kind} card must reference an entry, not a kanji`);
      }
      if (c.entry !== undefined && !entries.has(c.entry)) {
        issue(['cards', i, 'entry'], `unknown entry "${c.entry}" (expected "script|reading")`);
      }
      if (c.kanji !== undefined && !kanji.has(c.kanji)) {
        issue(['cards', i, 'kanji'], `unknown kanji "${c.kanji}"`);
      }
    });

    // The session builder unlocks a production card from its word's recognition card.
    const recognised = new Set(
      seed.cards.filter((c) => c.kind === 'recognition').map((c) => c.entry)
    );
    seed.cards.forEach((c, i) => {
      if (c.kind === 'production' && c.entry !== undefined && !recognised.has(c.entry)) {
        issue(['cards', i], `production card for "${c.entry}" has no recognition card`);
      }
    });
  });

export type Seed = z.infer<typeof seedSchema>;

export class SeedError extends Error {
  override name = 'SeedError';
}

export class SeedValidationError extends SeedError {
  override name = 'SeedValidationError';
  readonly problems: string[];

  constructor(problems: string[], origin = 'seed') {
    super(
      [
        `Invalid ${origin} (${problems.length} problem${problems.length === 1 ? '' : 's'}):`,
        ...problems.map((p) => `  - ${p}`),
      ].join('\n')
    );
    this.problems = problems;
  }
}

function formatPath(path: readonly PropertyKey[]): string {
  return (
    path
      .map((part, i) =>
        typeof part === 'number' ? `[${part}]` : `${i === 0 ? '' : '.'}${String(part)}`
      )
      .join('') || '(root)'
  );
}

/** Validates unknown input as a seed, or throws `SeedValidationError` listing every problem. */
export function parseSeed(input: unknown, origin?: string): Seed {
  const result = seedSchema.safeParse(input);
  if (result.success) return result.data;
  throw new SeedValidationError(
    result.error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`),
    origin
  );
}
