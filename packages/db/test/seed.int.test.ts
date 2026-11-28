import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { createTestDatabase, resetTables } from '../src/testing/db.js';
import { card, contentVersion, entry, kanji, unit } from '../src/schema/index.js';
import { getCurrentContentVersion } from '../src/queries/content-version.js';
import {
  contentId,
  contentKeys,
  contentVersionHash,
  DEFAULT_SEED_FILE,
  loadSeed,
  readSeedFile,
  type Seed,
  SeedConflictError,
  seedToRows,
} from '../src/seed/index.js';

const seed = readSeedFile(DEFAULT_SEED_FILE);
const waterCardId = contentId(
  contentKeys.card('recognition', contentKeys.entry('ja', '水', 'みず'))
);

describe('loadSeed', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: typeof testDatabase.db;

  /** Every content row, ordered, for before/after comparisons. */
  const snapshot = async () => ({
    units: await db.select().from(unit).orderBy(asc(unit.id)),
    entries: await db.select().from(entry).orderBy(asc(entry.id)),
    kanji: await db.select().from(kanji).orderBy(asc(kanji.id)),
    cards: await db.select().from(card).orderBy(asc(card.id)),
    versions: await db.select().from(contentVersion).orderBy(asc(contentVersion.versionHash)),
  });

  const editGloss = (base: Seed, script: string, gloss: string[]): Seed => {
    const edited = structuredClone(base);
    edited.entries.find((e) => e.script === script)!.gloss = gloss;
    return edited;
  };

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    db = testDatabase.db;
  });
  afterAll(async () => {
    await testDatabase.dispose();
  });
  beforeEach(async () => {
    await resetTables(testDatabase.sql);
  });

  it('loads about 30 cards into an empty database', async () => {
    const result = await loadSeed(db, seed);

    expect(result.counts).toEqual({ units: 2, entries: 12, kanji: 6, cards: 30 });
    expect(result.written).toEqual(result.counts);
    expect(result.versionChanged).toBe(true);
    expect(result.versionHash).toBe(contentVersionHash(seed));
    expect(await getCurrentContentVersion(db)).toBe(result.versionHash);

    const rows = await snapshot();
    expect(rows.cards).toHaveLength(30);
    expect(rows.units.map((u) => u.language)).toEqual(['ja', 'ja']);
    expect(rows.versions).toHaveLength(1);
  });

  it('stores the ids derived from natural keys', async () => {
    await loadSeed(db, seed);
    const expected = seedToRows(seed)
      .cards.map((c) => c.id)
      .sort();
    expect((await snapshot()).cards.map((c) => c.id)).toEqual(expected);
    expect(await db.select().from(card).where(eq(card.id, waterCardId))).toHaveLength(1);
  });

  it('changes nothing when run twice, including ids and the content version', async () => {
    await loadSeed(db, seed);
    const before = await snapshot();

    const second = await loadSeed(db, seed);

    expect(second.versionChanged).toBe(false);
    expect(second.written).toEqual({ units: 0, entries: 0, kanji: 0, cards: 0 });
    expect(await snapshot()).toEqual(before); // loaded_at included
  });

  it('updates a changed gloss and records a new content version', async () => {
    await loadSeed(db, seed);
    const before = await snapshot();
    const edited = editGloss(seed, '水', ['water', 'cold water']);

    const result = await loadSeed(db, edited);

    expect(result.versionChanged).toBe(true);
    expect(result.written).toEqual({ units: 0, entries: 1, kanji: 0, cards: 0 });
    const after = await snapshot();
    const water = after.entries.find((e) => e.script === '水')!;
    expect(water.gloss).toEqual(['water', 'cold water']);
    expect(water.id).toBe(before.entries.find((e) => e.script === '水')!.id);
    expect(after.versions).toHaveLength(2);
    expect(await getCurrentContentVersion(db)).toBe(contentVersionHash(edited));
    // Everything else is untouched.
    expect(after.entries.filter((e) => e.id !== water.id)).toEqual(
      before.entries.filter((e) => e.id !== water.id)
    );
    expect(after.cards).toEqual(before.cards);
  });

  it('makes an earlier version current again when the seed reverts to it', async () => {
    await loadSeed(db, seed);
    await loadSeed(db, editGloss(seed, '水', ['drinking water']));

    const result = await loadSeed(db, seed);

    expect(result.versionChanged).toBe(true);
    expect(await getCurrentContentVersion(db)).toBe(contentVersionHash(seed));
    expect((await snapshot()).versions).toHaveLength(2);
  });

  it('handles two cards swapping positions', async () => {
    await loadSeed(db, seed);
    const swapped = structuredClone(seed);
    const [a, b] = [swapped.cards[0]!, swapped.cards[1]!];
    [a.position, b.position] = [b.position, a.position];

    const result = await loadSeed(db, swapped);

    expect(result.written.cards).toBe(2);
    const water = await db.select().from(card).where(eq(card.id, waterCardId));
    expect(water[0]!.position).toBe(2);
  });

  it('never deletes a row missing from the seed, and reports it', async () => {
    await loadSeed(db, seed);
    const withoutLastKanji = structuredClone(seed);
    const removed = withoutLastKanji.cards.pop()!;

    const result = await loadSeed(db, withoutLastKanji);

    const removedId = contentId(contentKeys.card('kanji', contentKeys.kanji('ja', removed.kanji!)));
    expect(result.orphans).toEqual({ units: [], entries: [], kanji: [], cards: [removedId] });
    expect(await db.select().from(card).where(eq(card.id, removedId))).toHaveLength(1);
    expect((await snapshot()).cards).toHaveLength(30);
  });

  it('stops with a clear message, writing nothing, when an orphan holds a wanted position', async () => {
    await loadSeed(db, seed);
    // Replace 店's kanji card with a new kanji at the same position.
    const conflicting = structuredClone(seed);
    conflicting.kanji.push({
      glyph: '茶',
      onReadings: ['チャ'],
      kunReadings: [],
      gloss: ['tea'],
      freqRank: 260,
      source: 'hand-written',
    });
    conflicting.cards[29] = { kind: 'kanji', kanji: '茶', unit: 'food-kanji', position: 6 };
    const before = await snapshot();

    const error = await loadSeed(db, conflicting).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SeedConflictError);
    expect((error as Error).message).toMatch(
      /wants position 6 in unit .* held by card .*not in the seed/
    );
    expect(await snapshot()).toEqual(before);
  });
});
