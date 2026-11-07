import { createHash, randomBytes } from 'crypto';
import { type Config } from '../config.js';

export const SESSION_EXTENSION_THRESHOLD_DAYS = 15;
export const SESSION_LIFETIME_DAYS = 30;
export const SESSION_COOKIE_NAME = 'token';

type SessionCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
};

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

export function generateToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + daysToMs(SESSION_LIFETIME_DAYS));
}

export function shouldExtendSession(expiresAt: Date, now: Date): boolean {
  const remainingMs = expiresAt.getTime() - now.getTime();
  const thresholdMs = daysToMs(SESSION_EXTENSION_THRESHOLD_DAYS);

  return remainingMs > 0 && remainingMs < thresholdMs;
}

export function getSessionCookieBaseOptions(nodeEnv: string): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: nodeEnv === 'production',
  };
}

export function getSessionCookieOptions(nodeEnv: Config['NODE_ENV']) {
  return {
    ...getSessionCookieBaseOptions(nodeEnv),
    maxAge: SESSION_LIFETIME_DAYS * 60 * 60 * 24,
  };
}
