/** Password length limits. Shared so the web forms and the API enforce the same bounds. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Practical upper bound for an email address (RFC 5321 path limit). */
export const EMAIL_MAX_LENGTH = 254;

/** Upper bound for the invite code field, to keep request bodies small. */
export const INVITE_CODE_MAX_LENGTH = 256;
