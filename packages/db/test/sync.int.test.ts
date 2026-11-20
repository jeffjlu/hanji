import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql as dsql, eq } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/db.js';
import { appUser, card, entry, reviewEvent, unit, userCard } from '../src/schema/index.js';
import { expectPgError, PG } from './helpers/helpers.js';
import { cardRow, entryRow, unitRow } from './helpers/rows.js';
import { id } from '../src/testing/ids.js';

const CARD_ID = id(301);
const USER_A = id(901);
const USER_B = id(902);

const eventRow = (n: number, o: Record<string, unknown> = {}) => ({
  id: id(1000 + n),
  userId: USER_A,
  cardId: CARD_ID,
  deviceId: id(800),
  reviewedAt: new Date('2026-01-05T08:00:00.000Z'),
  tz: 'UTC',
  retention: 0.9,
  rating: 3 as const,
  responseMs: 5000,
  correct: true,
  hintUsed: false,
  userSeq: n,
  localDay: '2026-01-05',
  ...o,
});

const userCardRow = (o: Record<string, unknown> = {}) => ({
  userId: USER_A,
  cardId: CARD_ID,
  state: 'Review' as const,
  due: new Date('2026-01-13T08:00:00.000Z'),
  stability: 7.31918604,
  difficulty: 2.1043314,
  reps: 3,
  lapses: 0,
  lastReview: new Date('2026-01-06T08:00:00.000Z'),
  lastSeq: 3,
  correctReps: 3,
  firstReview: new Date('2026-01-05T08:00:00.000Z'),
  scheduledDays: 7,
  learningStep: 0,
  ...o,
});

describe('sync tables', () => {
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
    await db.execute(
      dsql`TRUNCATE review_event, user_card, card, entry, unit, session, app_user CASCADE`
    );
    // Adjust the columns to match your app_user table.
    await db.insert(appUser).values([
      { id: USER_A, email: 'a@example.com', passwordHash: 'x' },
      { id: USER_B, email: 'b@example.com', passwordHash: 'x' },
    ] as never);
    await db.insert(unit).values(unitRow(1));
    await db.insert(entry).values(entryRow(1, id(1)));
    await db.insert(card).values(cardRow(1, id(1), { entryId: id(101) }));
  });

  describe('review_event', () => {
    it('inserts a valid event and defaults received_at', async () => {
      await db.insert(reviewEvent).values(eventRow(1));
      const [row] = await db.select().from(reviewEvent);
      expect(row?.receivedAt).toBeInstanceOf(Date);
    });

    it('round-trips retention exactly', async () => {
      await db.insert(reviewEvent).values(eventRow(1, { retention: 0.9 }));
      const [row] = await db.select().from(reviewEvent);
      expect(row?.retention).toBe(0.9);
    });

    it('rejects a duplicate (user_id, user_seq)', async () => {
      await db.insert(reviewEvent).values(eventRow(1));
      await expectPgError(
        db.insert(reviewEvent).values(eventRow(2, { userSeq: 1 })),
        PG.UNIQUE,
        'review_event_user_seq_uq'
      );
    });

    it('allows the same user_seq for different users', async () => {
      await db
        .insert(reviewEvent)
        .values([eventRow(1), eventRow(2, { userId: USER_B, userSeq: 1 })]);
    });

    // Each bad row is chosen so that only the named check fails.
    it.each([
      { name: 'rating 0', row: { rating: 0 }, constraint: 'review_event_rating_chk' },
      { name: 'rating 5', row: { rating: 5 }, constraint: 'review_event_rating_chk' },
      {
        name: 'retention 0.69',
        row: { retention: 0.69 },
        constraint: 'review_event_retention_chk',
      },
      {
        name: 'retention 0.98',
        row: { retention: 0.98 },
        constraint: 'review_event_retention_chk',
      },
      {
        name: 'negative response_ms',
        row: { responseMs: -1 },
        constraint: 'review_event_response_ms_chk',
      },
      {
        name: 'rating 1 with correct true',
        row: { rating: 1, correct: true },
        constraint: 'review_event_correct_chk',
      },
      {
        name: 'rating 3 with correct false',
        row: { rating: 3, correct: false },
        constraint: 'review_event_correct_chk',
      },
    ])('rejects $name', async ({ row, constraint }) => {
      await expectPgError(db.insert(reviewEvent).values(eventRow(1, row)), PG.CHECK, constraint);
    });

    it.each([0.7, 0.97])('accepts the retention boundary %s', async (retention) => {
      await db.insert(reviewEvent).values(eventRow(1, { retention }));
    });

    it('accepts rating 1 with correct false', async () => {
      await db.insert(reviewEvent).values(eventRow(1, { rating: 1, correct: false }));
    });

    it('rejects a nonexistent card', async () => {
      await expectPgError(
        db.insert(reviewEvent).values(eventRow(1, { cardId: id(999) })),
        PG.FOREIGN_KEY,
        'review_event_card_id_card_id_fk'
      );
    });

    it('rejects a nonexistent user', async () => {
      await expectPgError(
        db.insert(reviewEvent).values(eventRow(1, { userId: id(999) })),
        PG.FOREIGN_KEY,
        'review_event_user_id_app_user_id_fk'
      );
    });
  });

  describe('append-only trigger', () => {
    beforeEach(async () => {
      await db.insert(reviewEvent).values(eventRow(1));
    });

    it('rejects UPDATE and leaves the row unchanged', async () => {
      await expectPgError(
        db
          .update(reviewEvent)
          .set({ rating: 4 })
          .where(eq(reviewEvent.id, id(1001))),
        PG.RAISE
      );
      const [row] = await db.select().from(reviewEvent);
      expect(row?.rating).toBe(3);
    });

    it('still allows DELETE', async () => {
      await db.delete(reviewEvent).where(eq(reviewEvent.id, id(1001)));
      expect(await db.select().from(reviewEvent)).toHaveLength(0);
    });

    it('does not block the cascade from deleting a user', async () => {
      await db.delete(appUser).where(eq(appUser.id, USER_A));
      expect(await db.select().from(reviewEvent)).toHaveLength(0);
    });
  });

  describe('user_card', () => {
    it('inserts a valid row', async () => {
      await db.insert(userCard).values(userCardRow());
      expect(await db.select().from(userCard)).toHaveLength(1);
    });

    it('rejects a duplicate (user_id, card_id)', async () => {
      await db.insert(userCard).values(userCardRow());
      await expectPgError(
        db.insert(userCard).values(userCardRow()),
        PG.UNIQUE,
        'user_card_user_id_card_id_pk'
      );
    });

    it.each([
      { name: 'negative stability', row: { stability: -1 }, constraint: 'user_card_stability_chk' },
      { name: 'difficulty 0.9', row: { difficulty: 0.9 }, constraint: 'user_card_difficulty_chk' },
      {
        name: 'difficulty 10.1',
        row: { difficulty: 10.1 },
        constraint: 'user_card_difficulty_chk',
      },
    ])('rejects $name', async ({ row, constraint }) => {
      await expectPgError(db.insert(userCard).values(userCardRow(row)), PG.CHECK, constraint);
    });

    it.each([1, 10])('accepts the difficulty boundary %s', async (difficulty) => {
      await db.insert(userCard).values(userCardRow({ difficulty }));
    });

    it('round-trips fractional FSRS values exactly', async () => {
      await db
        .insert(userCard)
        .values(userCardRow({ difficulty: 2.11810397, stability: 31.70341833 }));
      const [row] = await db.select().from(userCard);
      expect(row?.difficulty).toBe(2.11810397);
      expect(row?.stability).toBe(31.70341833);
    });

    it('cascades from the user', async () => {
      await db.insert(userCard).values(userCardRow());
      await db.delete(appUser).where(eq(appUser.id, USER_A));
      expect(await db.select().from(userCard)).toHaveLength(0);
    });

    it('blocks deleting a card that has a user_card row', async () => {
      await db.insert(userCard).values(userCardRow());
      await expectPgError(
        db.delete(card).where(eq(card.id, CARD_ID)),
        PG.FOREIGN_KEY,
        'user_card_card_id_card_id_fk'
      );
    });
  });

  describe('card deletion with review history', () => {
    it('blocks deleting a card that has review events', async () => {
      await db.insert(reviewEvent).values(eventRow(1));
      await expectPgError(
        db.delete(card).where(eq(card.id, CARD_ID)),
        PG.FOREIGN_KEY,
        'review_event_card_id_card_id_fk'
      );
    });

    it('allows deleting a card with no events', async () => {
      await db.delete(card).where(eq(card.id, CARD_ID));
      expect(await db.select().from(card)).toHaveLength(0);
    });
  });
});
