import { z } from 'zod';
import {
  MAX_EVENTS_PER_REQUEST,
  MAX_RESPONSE_MS,
  MAX_RETENTION,
  MIN_RETENTION,
  Rating,
} from './constants.js';

export const CARD_STATES = ['New', 'Learning', 'Review', 'Relearning'] as const;

export type CardStateName = (typeof CARD_STATES)[number];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, 'Expected an IANA zone name')
  .refine(isValidTimeZone, 'Unknown time zone');

export const reviewEventInSchema = z
  .object({
    id: z.uuidv7(),
    cardId: z.uuid(),
    reviewedAt: z.iso.datetime({ offset: true }),
    tz: timeZoneSchema,
    retention: z.number().min(MIN_RETENTION).max(MAX_RETENTION),
    rating: z.enum(Rating),
    responseMs: z.number().min(0).max(MAX_RESPONSE_MS),
    correct: z.boolean(),
    hintUsed: z.boolean(),
  })
  .refine((event) => {
    return event.correct === (event.rating !== Rating.Again);
  });
export type ReviewEventIn = z.infer<typeof reviewEventInSchema>;

export const syncRequestSchema = z.object({
  deviceId: z.uuid(),
  sinceSeq: z.int().nonnegative(),
  events: z.looseObject({ id: z.string() }).array().max(MAX_EVENTS_PER_REQUEST),
});
export type SyncRequest = Omit<z.infer<typeof syncRequestSchema>, 'events'> & {
  events: ReviewEventIn[];
};

export const rejectedSchema = z
  .object({
    id: z.string(),
    reason: z.enum(['future', 'unknown_card', 'invalid']),
  })
  .array();

export const userCardStateSchema = z.object({
  cardId: z.uuid(),
  state: z.enum(CARD_STATES),
  due: z.iso.datetime(),
  stabilityFast: z.number().min(0),
  stability: z.number().min(0),
  difficulty: z.number().min(1).max(10),
  reps: z.int().nonnegative(),
  lapses: z.int().nonnegative(),
  lastReview: z.iso.datetime(),
  lastSeq: z.int().nonnegative(),
  correctReps: z.int().nonnegative(),
  firstReview: z.iso.datetime(),
  scheduledDays: z.int().nonnegative(),
  learningStep: z.int().nonnegative(),
});

export type UserCardState = z.infer<typeof userCardStateSchema>;

export const syncResponseSchema = z.object({
  accepted: z.uuidv7().array(),
  rejected: rejectedSchema,
  cardStates: userCardStateSchema.array(),
  serverSeq: z.int().nonnegative(),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;
