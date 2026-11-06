import { createHash, randomBytes } from 'crypto';

export const SESSION_EXTENSION_THRESHOLD_DAYS = 15;
export const SESSION_LIFETIME_DAYS = 30;

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

export function getSessionCookieOptions(nodeEnv: string): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: nodeEnv === 'production',
  };
}
