import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const unit = pgTable('unit', {
  id: uuid('id').primaryKey(),
  language: text('language').default('ja').notNull(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  position: integer('position').unique().notNull(),
});

export const entry = pgTable(
  'entry',
  {
    id: uuid('id').primaryKey(),
    script: text('script').notNull(),
    reading: text('reading').notNull(),
    gloss: text('gloss').array().notNull(),
    pos: text('pos').notNull(),
    freqRank: integer('freq_rank').notNull(),
    unitId: uuid('unit_id')
      .references(() => unit.id)
      .notNull(),
  },
  (t) => [
    index('entry_unit_id_idx').on(t.unitId),
    check('entry_gloss_chk', sql`CARDINALITY(${t.gloss}) >= 1`),
  ]
);

export const kanji = pgTable(
  'kanji',
  {
    id: uuid('id').primaryKey(),
    glyph: text('glyph').unique().notNull(),
    onReadings: text('on_readings').array().notNull(),
    kunReadings: text('kun_readings').array().notNull(),
    gloss: text('gloss').array().notNull(),
    freqRank: integer('freq_rank').notNull(),
  },
  (t) => [check('kanji_gloss_chk', sql`CARDINALITY(${t.gloss}) >= 1`)]
);

export const card = pgTable(
  'card',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind', { enum: ['recognition', 'production', 'kanji'] }).notNull(),
    position: integer('position').notNull(),
    entryId: uuid('entry_id').references(() => entry.id),
    kanjiId: uuid('kanji_id').references(() => kanji.id),
    unitId: uuid('unit_id')
      .references(() => unit.id)
      .notNull(),
  },
  (t) => [
    index('card_entry_id_idx').on(t.entryId),
    index('card_kanji_id_idx').on(t.kanjiId),
    unique('card_unit_id_position_uq').on(t.unitId, t.position),
    unique('card_kind_entry_uq').on(t.kind, t.entryId),
    unique('card_kind_kanji_uq').on(t.kind, t.kanjiId),
    check('card_one_target_chk', sql`(${t.entryId} IS NULL) <> (${t.kanjiId} IS NULL)`),
    check('card_kind_target_chk', sql`(${t.kind} = 'kanji') = (${t.kanjiId} IS NOT NULL)`),
  ]
);

export const contentVersion = pgTable('content_version', {
  versionHash: text('version_hash').primaryKey(),
  loadedAt: timestamp('loaded_at', { withTimezone: true }).notNull().defaultNow(),
});
