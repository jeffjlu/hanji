import { describe, expect, it } from 'vitest';
import {
  generateToken,
  getSessionCookieOptions,
  getSessionExpiry,
  hashToken,
  SESSION_EXTENSION_THRESHOLD_DAYS,
  SESSION_LIFETIME_DAYS,
  shouldExtendSession,
} from './session.js';

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

// Base64URL alphabet (no padding, no '+' or '/').
const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe('generateToken', () => {
  it('returns a 256-bit base64url string', () => {
    const token = generateToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(BASE64URL);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
    expect(token).toHaveLength(43);
  });

  it('produces unique tokens across calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('returns a stable sha256 hex digest for the same token', () => {
    const token = 'some-token-value';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('is sensitive to small changes in the token', () => {
    expect(hashToken('Token')).not.toBe(hashToken('token'));
  });

  it('returns the expected SHA-256 digest', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('getSessionExpiry', () => {
  it('returns an expiry in the future relative to now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = getSessionExpiry(now);
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
  });

  it('adds SESSION_LIFETIME_DAYS to now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiry = getSessionExpiry(now);
    expect(expiry.getTime()).toBe(now.getTime() + daysToMs(SESSION_LIFETIME_DAYS));
  });
});

describe('shouldExtendSession', () => {
  it('returns true when the session expires within the threshold', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date(now.getTime() + daysToMs(SESSION_EXTENSION_THRESHOLD_DAYS) - 1);
    expect(shouldExtendSession(expiresAt, now)).toBe(true);
  });

  it('returns false when the session expires beyond the threshold', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    // Expires 20 days from now — beyond the 15-day threshold.
    const expiresAt = new Date(now.getTime() + daysToMs(20));
    expect(shouldExtendSession(expiresAt, now)).toBe(false);
  });

  it('returns false exactly at the threshold (strictly less than)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date(now.getTime() + daysToMs(SESSION_EXTENSION_THRESHOLD_DAYS));
    expect(shouldExtendSession(expiresAt, now)).toBe(false);
  });

  it('returns false for an already-expired session', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date(now.getTime() - daysToMs(1));
    expect(shouldExtendSession(expiresAt, now)).toBe(false);
  });

  it('returns false when the expiry is now', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(shouldExtendSession(now, now)).toBe(false);
  });
});

describe('getSessionCookieOptions', () => {
  it('sets httpOnly, sameSite=lax, path=/ in every environment', () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      const options = getSessionCookieOptions(nodeEnv);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
    }
  });

  it('sets secure=true in production', () => {
    expect(getSessionCookieOptions('production').secure).toBe(true);
  });

  it('sets secure=false in non-production environments', () => {
    expect(getSessionCookieOptions('development').secure).toBe(false);
    expect(getSessionCookieOptions('test').secure).toBe(false);
  });
});
