import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql as dsql, eq } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/db.js';
import { card, entry, kanji, unit } from '../src/schema/index.js';
import { expectPgError, id, PG } from './helpers/helpers.js';
import { cardRow, entryRow, kanjiRow, unitRow } from './helpers/rows.js';

describe('content tables', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: typeof testDatabase.db;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  });
  afterAll(async () => {
    await testDatabase.dispose();
  });
  beforeEach(async () => {
    await db.execute(dsql`TRUNCATE card, entry, kanji, unit, content_version CASCADE`);
    await db.insert(unit).values([unitRow(1), unitRow(2)]);
    await db.insert(entry).values(entryRow(1, id(1)));
    await db.insert(kanji).values(kanjiRow(1));
  });

  describe('card target constraints', () => {
    it('accepts valid recognition, production and kanji cards', async () => {
      await db
        .insert(card)
        .values([
          cardRow(1, id(1), { kind: 'recognition', entryId: id(101), position: 1 }),
          cardRow(2, id(1), { kind: 'production', entryId: id(101), position: 2 }),
          cardRow(3, id(1), { kind: 'kanji', kanjiId: id(201), position: 3 }),
        ]);
      expect(await db.select().from(card)).toHaveLength(3);
    });

    it.each([
      {
        name: 'recognition card with only kanji_id',
        row: { kind: 'recognition', kanjiId: id(201) },
        constraint: 'card_kind_target_chk',
      },
      {
        name: 'production card with only kanji_id',
        row: { kind: 'production', kanjiId: id(201) },
        constraint: 'card_kind_target_chk',
      },
      {
        name: 'kanji card with only entry_id',
        row: { kind: 'kanji', entryId: id(101) },
        constraint: 'card_kind_target_chk',
      },
      {
        name: 'recognition card with neither target',
        row: { kind: 'recognition' },
        constraint: 'card_one_target_chk',
      },
      {
        name: 'kanji card with both targets',
        row: { kind: 'kanji', entryId: id(101), kanjiId: id(201) },
        constraint: 'card_one_target_chk',
      },
    ] as const)('rejects $name', async ({ row, constraint }) => {
      await expectPgError(db.insert(card).values(cardRow(1, id(1), row)), PG.CHECK, constraint);
    });

    it('rejects a duplicate (unit_id, position)', async () => {
      await db.insert(card).values(cardRow(1, id(1), { entryId: id(101), position: 1 }));
      await expectPgError(
        db.insert(card).values(cardRow(2, id(1), { kind: 'kanji', kanjiId: id(201), position: 1 })),
        PG.UNIQUE,
        'card_unit_id_position_uq'
      );
    });

    it('allows the same position in different units', async () => {
      await db
        .insert(card)
        .values([
          cardRow(1, id(1), { entryId: id(101), position: 1 }),
          cardRow(2, id(2), { kind: 'kanji', kanjiId: id(201), position: 1 }),
        ]);
    });

    it('rejects a second card of the same kind for one entry', async () => {
      await db.insert(card).values(cardRow(1, id(1), { entryId: id(101), position: 1 }));
      await expectPgError(
        db.insert(card).values(cardRow(2, id(1), { entryId: id(101), position: 2 })),
        PG.UNIQUE,
        'card_kind_entry_uq'
      );
    });

    it('rejects a second kanji card for one kanji', async () => {
      await db
        .insert(card)
        .values(cardRow(1, id(1), { kind: 'kanji', kanjiId: id(201), position: 1 }));
      await expectPgError(
        db.insert(card).values(cardRow(2, id(1), { kind: 'kanji', kanjiId: id(201), position: 2 })),
        PG.UNIQUE,
        'card_kind_kanji_uq'
      );
    });
  });

  describe('content table constraints', () => {
    it.each([
      {
        name: 'entry with empty gloss',
        table: entry,
        row: entryRow(2, id(1), { gloss: [] }),
        constraint: 'entry_gloss_chk',
      },
      {
        name: 'kanji with empty gloss',
        table: kanji,
        row: kanjiRow(2, { gloss: [] }),
        constraint: 'kanji_gloss_chk',
      },
    ])('rejects $name', async ({ table, row, constraint }) => {
      await expectPgError(db.insert(table).values(row as never), PG.CHECK, constraint);
    });

    it.each([
      {
        name: 'duplicate unit slug',
        run: () => db.insert(unit).values(unitRow(3, { slug: 'unit-1' })),
        constraint: 'unit_slug_unique',
      },
      {
        name: 'duplicate unit position',
        run: () => db.insert(unit).values(unitRow(3, { position: 1 })),
        constraint: 'unit_position_unique',
      },
      {
        name: 'duplicate kanji glyph',
        run: () => db.insert(kanji).values(kanjiRow(3, { glyph: kanjiRow(1).glyph })),
        constraint: 'kanji_glyph_unique',
      },
    ])('rejects $name', async ({ run, constraint }) => {
      await expectPgError(run(), PG.UNIQUE, constraint);
    });

    it('rejects an entry pointing at a nonexistent unit', async () => {
      await expectPgError(
        db.insert(entry).values(entryRow(2, id(999))),
        PG.FOREIGN_KEY,
        'entry_unit_id_unit_id_fk'
      );
    });

    it('rejects a card pointing at a nonexistent unit', async () => {
      await expectPgError(
        db.insert(card).values(cardRow(1, id(999), { entryId: id(101) })),
        PG.FOREIGN_KEY,
        'card_unit_id_unit_id_fk'
      );
    });
  });

  describe('deleting content with dependents is blocked', () => {
    beforeEach(async () => {
      await db
        .insert(card)
        .values([
          cardRow(1, id(1), { entryId: id(101), position: 1 }),
          cardRow(2, id(1), { kind: 'kanji', kanjiId: id(201), position: 2 }),
        ]);
    });

    it('blocks deleting a unit that has entries and cards', async () => {
      await expectPgError(db.delete(unit).where(eq(unit.id, id(1))), PG.FOREIGN_KEY);
    });

    it('blocks deleting an entry that has a card', async () => {
      await expectPgError(
        db.delete(entry).where(eq(entry.id, id(101))),
        PG.FOREIGN_KEY,
        'card_entry_id_entry_id_fk'
      );
    });

    it('blocks deleting a kanji that has a card', async () => {
      await expectPgError(
        db.delete(kanji).where(eq(kanji.id, id(201))),
        PG.FOREIGN_KEY,
        'card_kanji_id_kanji_id_fk'
      );
    });

    it('allows deleting a unit with no dependents', async () => {
      await db.delete(unit).where(eq(unit.id, id(2)));
      expect(await db.select().from(unit)).toHaveLength(1);
    });
  });
});
