import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  INVITE_CODE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constants.js';

/** Emails are trimmed and lower-cased before validation, matching the unique index on lower(email). */
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

/** Strength rule applied when a password is created. */
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/**
 * Login only checks that something was sent, within the upper bound.
 * Enforcing the minimum here would leak the password policy and add nothing,
 * because the hash comparison decides the outcome.
 */
export const loginPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/** POST /api/v1/auth/register */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  inviteCode: z.string().trim().min(1).max(INVITE_CODE_MAX_LENGTH),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** POST /api/v1/auth/login */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * GET /api/v1/me, and the body returned by register and login.
 * Phase 0 exposes only identity. Settings fields (tz, tripDate, travelMode,
 * dailyGoal, newPerDay, targetRetention) are added in Phase 4 as an additive change.
 * Never include password_hash or last_seq.
 */
export const currentUserResponseSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
});
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
