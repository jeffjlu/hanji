import { id } from './ids.js';
import { card, entry, kanji, unit } from '../schema/index.js';
import { cardRow, entryRow, kanjiRow, unitRow } from '../../test/helpers/rows.js';
import type { Database } from '../client.js';

export const FIXTURE = {
  unitId: id(1),
  entryId: id(101),
  kanjiId: id(201),
  recognitionCardId: id(301),
  productionCardId: id(302),
  kanjiCardId: id(303),
} as const;

/** Insert one unit, entry, kanji, and three card rows (one of each kind) */
export async function insertContentFixture(db: Database) {
  await db.insert(unit).values(unitRow(1));
  await db.insert(entry).values(entryRow(1, FIXTURE.unitId));
  await db.insert(kanji).values(kanjiRow(1));
  await db
    .insert(card)
    .values([
      cardRow(1, FIXTURE.unitId, { kind: 'recognition', entryId: FIXTURE.entryId, position: 1 }),
      cardRow(2, FIXTURE.unitId, { kind: 'production', entryId: FIXTURE.entryId, position: 2 }),
      cardRow(3, FIXTURE.unitId, { kind: 'kanji', kanjiId: FIXTURE.kanjiId, position: 3 }),
    ]);
  return FIXTURE;
}
