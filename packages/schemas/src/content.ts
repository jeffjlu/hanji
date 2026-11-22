import { z } from 'zod';
import { CARD_KINDS } from './constants.js';

export const entryDtoSchema = z.object({
  id: z.uuid(),
  script: z.string().min(1),
  reading: z.string().min(1),
  gloss: z.string().array().min(1),
  pos: z.string().min(1),
  freqRank: z.int().nonnegative(),
});

export const kanjiDtoSchema = z.object({
  id: z.uuid(),
  glyph: z.string().min(1),
  onReadings: z.string().array(),
  kunReadings: z.string().array(),
  gloss: z.string().array().min(1),
  freqRank: z.int().nonnegative(),
});

export const cardDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(CARD_KINDS),
    position: z.int().nonnegative(),
    entry: entryDtoSchema.nullable(),
    kanji: kanjiDtoSchema.nullable(),
  })
  .refine(
    (card) => (card.entry === null) !== (card.kanji === null),
    'A card must have exactly one of entry or kanji'
  );

export const unitDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  position: z.int().nonnegative(),
});

export const unitContentSchema = z.object({
  unit: unitDtoSchema,
  cards: cardDtoSchema.array(),
});

export const manifestSchema = z.object({
  contentVersion: z.string(),
  units: unitDtoSchema.extend({ cardCount: z.int().nonnegative() }).array(),
});

export type EntryDto = z.infer<typeof entryDtoSchema>;
export type KanjiDto = z.infer<typeof kanjiDtoSchema>;
export type CardDto = z.infer<typeof cardDtoSchema>;
export type UnitDto = z.infer<typeof unitDtoSchema>;
