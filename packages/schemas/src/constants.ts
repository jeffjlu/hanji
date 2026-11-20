/** Password length limits. Shared so the web forms and the API enforce the same bounds. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Practical upper bound for an email address (RFC 5321 path limit). */
export const EMAIL_MAX_LENGTH = 254;

/** Upper bound for the invite code field, to keep request bodies small. */
export const INVITE_CODE_MAX_LENGTH = 256;

/** Limits for target retention. Change upper bound to tune workload and lower bound to tune usefulness. */
export const MIN_RETENTION = 0.7;
export const MAX_RETENTION = 0.97;

/** Maximum number of events sent in a sync request. */
export const MAX_EVENTS_PER_REQUEST = 500;

/** Maximum plausible response time for a card, in milliseconds. */
export const MAX_RESPONSE_MS = 10 * 60 * 1000;

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];

export const MIN_RATING = Rating.Again;
export const MAX_RATING = Rating.Easy;

export const CARD_KINDS = ['recognition', 'production', 'kanji'] as const;

/** Maximum future skew for a review event's reviewedAt, in milliseconds */
export const MAX_FUTURE_SKEW = 5 * 60 * 1000;
