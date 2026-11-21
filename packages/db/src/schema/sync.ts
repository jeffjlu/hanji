import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { card } from './content.js';
import { appUser } from './auth.js';
import { sql } from 'drizzle-orm';

export const reviewEvent = pgTable(
  'review_event',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .references(() => appUser.id, { onDelete: 'cascade' })
      .notNull(),
    cardId: uuid('card_id')
      .references(() => card.id)
      .notNull(),
    deviceId: uuid('device_id').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
    tz: text('tz').notNull(),
    retention: doublePrecision('retention').notNull(),
    rating: integer('rating').$type<1 | 2 | 3 | 4>().notNull(),
    responseMs: integer('response_ms').notNull(),
    correct: boolean('correct').notNull(),
    hintUsed: boolean('hint_used').notNull(),
    userSeq: integer('user_seq').notNull(),
    localDay: date('local_day').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('review_event_user_seq_uq').on(t.userId, t.userSeq),
    index('review_event_user_card_idx').on(t.userId, t.cardId, t.reviewedAt, t.id),
    index('review_event_user_day_idx').on(t.userId, t.localDay),
    check('review_event_rating_chk', sql`${t.rating} between 1 and 4`),
    check('review_event_retention_chk', sql`${t.retention} between 0.70 and 0.97`),
    check('review_event_response_ms_chk', sql`${t.responseMs} >= 0`),
    check('review_event_correct_chk', sql`(${t.rating} = 1) = (NOT ${t.correct})`),
  ]
);

export type ReviewEvent = typeof reviewEvent.$inferSelect;
export type NewReviewEvent = typeof reviewEvent.$inferInsert;

export const userCard = pgTable(
  'user_card',
  {
    userId: uuid('user_id')
      .references(() => appUser.id, { onDelete: 'cascade' })
      .notNull(),
    cardId: uuid('card_id')
      .references(() => card.id)
      .notNull(),
    state: text('state', { enum: ['New', 'Learning', 'Review', 'Relearning'] }).notNull(),
    due: timestamp('due', { withTimezone: true }).notNull(),
    stability: doublePrecision('stability').notNull(),
    difficulty: doublePrecision('difficulty').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    lastReview: timestamp('last_review', { withTimezone: true }).notNull(),
    lastSeq: integer('last_seq').notNull(),
    correctReps: integer('correct_reps').notNull(),
    firstReview: timestamp('first_review', { withTimezone: true }).notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    learningStep: integer('learning_step').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index('user_card_user_seq_idx').on(t.userId, t.lastSeq),
    check('user_card_stability_chk', sql`${t.stability} >= 0`),
    check('user_card_difficulty_chk', sql`${t.difficulty} between 1 and 10`),
  ]
);

export type UserCard = typeof userCard.$inferSelect;
export type NewUserCard = typeof userCard.$inferInsert;
